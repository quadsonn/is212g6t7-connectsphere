import { ArrowLeft, CalendarClock, CheckCircle2, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { usePublicEvent } from '@/features/events/hooks/use-events';
import { RegisterAction } from '@/features/registrations/components/register-action';
import { RegisterForm } from '@/features/registrations/components/register-form';
import {
  useMyRegistrations,
  useRegistrationOptions,
  useWithdraw,
} from '@/features/registrations/hooks/use-registrations';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, formatDateTime } from '@/lib/utils';
import type { RegistrationView } from '@/types/api';

/**
 * US-02 / US-34 / US-36 — the Attendee's single-event screen, reachable from
 * Browse events and from My registrations. It reads the public projection
 * (GET /events/:id, scoped and stripped by the server) and shows the event's
 * status, dates, purpose, description and point of contact, then — depending
 * on whether the Attendee is already registered — either the register flow or
 * the withdrawal flow.
 *
 * Every registration decision is the server's: the options endpoint says
 * whether registration is open (with the window and how full it is) and the
 * registration record says whether withdrawal is still allowed. This page only
 * renders what those return; the register and withdraw endpoints re-check
 * every rule when the request arrives.
 */
export function AttendeeEventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const event = usePublicEvent(id);
  const options = useRegistrationOptions(id ?? '');
  const myRegistrations = useMyRegistrations();

  // The active registration for THIS event, if any — carries the id and the
  // live withdrawal rules the Withdraw action needs.
  const myRegistration = myRegistrations.data?.registrations.find(
    (registration) => registration.event.id === id && registration.status === 'REGISTERED',
  );
  const registered = Boolean(myRegistration) || options.data?.alreadyRegistered === true;

  return (
    <>
      <PageHeader
        title={event.data?.name ?? 'Event'}
        description="Event details, with the status and your registration."
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        }
      />

      {event.isPending ? <LoadingState label="Loading event…" /> : null}
      {event.isError ? (
        <ErrorState message={apiErrorMessage(event.error, 'Could not load this event.')} />
      ) : null}

      {event.data ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <EventStatusBadge status={event.data.status} />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-ink-700">
                <CalendarClock className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                {formatDateRange(event.data.proposedStart, event.data.proposedEnd)}
              </p>

              <p className="flex items-center gap-2 text-sm text-ink-700">
                <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                {event.data.venue ? (
                  <span>
                    {event.data.venue.name ?? 'Venue'}
                    {event.data.venue.location ? (
                      <span className="text-ink-500">, {event.data.venue.location}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="italic text-ink-500">Venue to be confirmed</span>
                )}
              </p>

              {event.data.purpose ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    Purpose
                  </h3>
                  <p className="mt-1 text-sm text-ink-700">{event.data.purpose}</p>
                </div>
              ) : null}

              {event.data.description ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    About this event
                  </h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-700">
                    {event.data.description}
                  </p>
                </div>
              ) : null}

              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Point of contact
                </h3>
                <p className="mt-1 text-sm text-ink-700">
                  {event.data.coordinator ? (
                    <>
                      {event.data.coordinator.name}{' '}
                      <span className="text-ink-500">({event.data.coordinator.email})</span>
                    </>
                  ) : (
                    <span className="italic text-ink-500">Not yet assigned</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <RegistrationCard
            eventId={event.data.id}
            registered={registered}
            myRegistration={myRegistration}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * The register-or-withdraw panel. Which branch shows is decided by whether the
 * Attendee already holds an active registration for this event.
 */
function RegistrationCard({
  eventId,
  registered,
  myRegistration,
}: {
  eventId: string;
  registered: boolean;
  myRegistration: RegistrationView | undefined;
}) {
  const options = useRegistrationOptions(eventId);
  const [showForm, setShowForm] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration</CardTitle>
        <RegistrationSummary />
      </CardHeader>
      <CardContent className="space-y-4">
        {registered ? (
          <WithdrawPanel myRegistration={myRegistration} />
        ) : justRegistered ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>You are registered for this event. It is now under My registrations.</span>
          </div>
        ) : showForm ? (
          <RegisterForm
            eventId={eventId}
            onCancel={() => setShowForm(false)}
            onRegistered={() => {
              setShowForm(false);
              setJustRegistered(true);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ink-600">
              Register to secure your place at this event.
            </p>
            <RegisterAction eventId={eventId} onRegister={() => setShowForm(true)} />
          </div>
        )}
      </CardContent>
    </Card>
  );

  /** Capacity and the registration window, straight from the options endpoint. */
  function RegistrationSummary() {
    if (!options.data) return null;
    const { registeredCount, capacity, opensAt, closesAt } = options.data;

    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" />
          {capacity !== null
            ? `${registeredCount} of ${capacity} places taken`
            : `${registeredCount} registered`}
        </span>
        {opensAt || closesAt ? (
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {opensAt ? `Opens ${formatDateTime(opensAt)}` : null}
            {opensAt && closesAt ? ' · ' : null}
            {closesAt ? `Closes ${formatDateTime(closesAt)}` : null}
          </span>
        ) : null}
      </div>
    );
  }
}

/** US-36 — the confirm-then-withdraw flow, mirroring My registrations. */
function WithdrawPanel({ myRegistration }: { myRegistration: RegistrationView | undefined }) {
  const [confirming, setConfirming] = useState(false);
  const withdraw = useWithdraw();

  const withdrawal = myRegistration?.withdrawal;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <span>You are registered for this event.</span>
      </div>

      {withdrawal?.withdrawalCutoffAt && withdrawal.canWithdraw ? (
        <p className="text-xs text-ink-500">
          You can withdraw until {formatDateTime(withdrawal.withdrawalCutoffAt)}.
        </p>
      ) : null}

      {!confirming ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            // When the record is not loaded yet, allow the attempt; the server
            // re-checks. Only an explicit "cannot withdraw" disables the button.
            disabled={withdrawal ? !withdrawal.canWithdraw : false}
            onClick={() => {
              withdraw.reset();
              setConfirming(true);
            }}
          >
            Withdraw
          </Button>
          {withdrawal && !withdrawal.canWithdraw && withdrawal.reason ? (
            <p className="mt-1.5 max-w-md text-xs text-ink-500">{withdrawal.reason}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">
            Withdraw from this event? Your place will be released for other attendees.
          </p>
          {withdraw.isError ? (
            <ErrorState message={apiErrorMessage(withdraw.error, 'Could not withdraw.')} />
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={withdraw.isPending || !myRegistration}
              onClick={() =>
                myRegistration &&
                withdraw.mutate(myRegistration.id, { onSuccess: () => setConfirming(false) })
              }
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Yes, withdraw'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep my place
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
