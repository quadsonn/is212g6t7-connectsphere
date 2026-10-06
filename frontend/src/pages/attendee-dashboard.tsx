import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { usePublicEvents } from '@/features/events/hooks/use-events';
import { RegisterForm } from '@/features/registrations/components/register-form';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';

/**
 * REAL data — GET /events. For an Attendee the backend returns only events
 * they can register for right now (CONFIRMED, registration open, not full, not
 * already registered) and projects internal planning fields away (US-02 AC-7).
 * Register opens the US-34 form inline; once registered, the event leaves this
 * list and appears under My registrations.
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
        description="Events open for registration."
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
          <CardTitle>Open events</CardTitle>
          {openForRegistration ? (
            <span className="text-sm text-ink-500">{openForRegistration.length} available</span>
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
            title="Nothing open right now"
            description="Confirmed events with registration open will be listed here."
          />
        ) : null}

        {openForRegistration && openForRegistration.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {openForRegistration.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-medium text-ink-900">{event.name}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)}
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

                {openFormId !== event.id ? (
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setJustRegistered(null);
                      setOpenFormId(event.id);
                    }}
                  >
                    Register
                  </Button>
                ) : null}

                {openFormId === event.id ? (
                  <RegisterForm
                    eventId={event.id}
                    onCancel={() => setOpenFormId(null)}
                    onRegistered={(registration) => {
                      setOpenFormId(null);
                      setJustRegistered(registration.event.name ?? 'the event');
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
