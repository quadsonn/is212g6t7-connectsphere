import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { usePublicEvents } from '@/features/events/hooks/use-events';
import { RegisterAction } from '@/features/registrations/components/register-action';
import { RegisterForm } from '@/features/registrations/components/register-form';
import { apiErrorMessage } from '@/lib/api-client';
import { cn, formatDateRange } from '@/lib/utils';

/**
 * REAL data — GET /events. For an Attendee the backend returns the confirmed,
 * upcoming events with registration switched on that they have not already
 * registered for, projected to drop internal planning fields (US-02 AC-7).
 * Not-yet-open and full events are included on purpose: each row asks the
 * server whether registration is available, and Register is disabled with the
 * reason and the open/close times when it is not. Events whose registration
 * has closed are left out by the server. Otherwise Register opens the US-34
 * form inline. Once registered, the event leaves this list and
 * appears under My registrations.
 */
export function AttendeeDashboard() {
  const { data: events, isPending, isError, error } = usePublicEvents();
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState<string | null>(null);

  const openForRegistration = events?.filter((event) => event.registrationEnabled);

  return (
    <>
      <PageHeader
        title="Browse events"
        description="Upcoming events. Registration may be open, not yet open or full."
      />

      {justRegistered ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>You are registered for {justRegistered}.</span>
          <Link to="/events/mine" className="font-medium underline">
            View my registrations
          </Link>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming events</CardTitle>
          {openForRegistration ? (
            <span className="text-sm text-ink-500">{openForRegistration.length} {openForRegistration.length === 1 ? 'event' : 'events'}</span>
          ) : null}
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load events.')} />
          </CardContent>
        ) : null}

        {openForRegistration && openForRegistration.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            description="Confirmed events that accept registration will be listed here."
          />
        ) : null}

        {openForRegistration && openForRegistration.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {openForRegistration.map((event) => (
              <li
                key={event.id}
                className="relative flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Stretched link: its ::after covers the whole card, so a
                        click anywhere opens the event. Suppressed while the
                        register form is open, so filling it never navigates. */}
                    <Link
                      to={`/events/${event.id}`}
                      className={cn(
                        'font-medium text-ink-900 hover:text-brand-700 hover:underline',
                        openFormId !== event.id &&
                          'after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-brand-600',
                      )}
                    >
                      {event.name}
                    </Link>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {event.venue
                      ? `${event.venue.name ?? 'Venue'}${
                          event.venue.location ? `, ${event.venue.location}` : ''
                        }`
                      : 'Venue to be confirmed'}
                  </p>
                  <p className="mt-1.5 max-w-2xl text-sm text-ink-600">{event.purpose}</p>
                  <p className="mt-1.5 text-xs text-ink-500">
                    Point of contact:{' '}
                    {event.coordinator ? (
                      <span className="text-ink-700">
                        {event.coordinator.name} ({event.coordinator.email})
                      </span>
                    ) : (
                      <span className="italic">not yet assigned</span>
                    )}
                  </p>
                </div>

                {/* Above the stretched link, so the controls stay clickable. */}
                {openFormId !== event.id ? (
                  <div className="relative z-10 shrink-0">
                    <RegisterAction
                      eventId={event.id}
                      onRegister={() => {
                        setJustRegistered(null);
                        setOpenFormId(event.id);
                      }}
                    />
                  </div>
                ) : null}

                {openFormId === event.id ? (
                  <div className="relative z-10 w-full">
                  <RegisterForm
                    eventId={event.id}
                    onCancel={() => setOpenFormId(null)}
                    onRegistered={(registration) => {
                      setOpenFormId(null);
                      setJustRegistered(registration.event.name ?? 'the event');
                    }}
                  />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
