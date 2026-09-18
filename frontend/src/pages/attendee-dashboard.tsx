import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { usePublicEvents } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';

/**
 * REAL data — GET /events. The backend projects internal planning fields away
 * for an Attendee (US-02 AC-7), so this screen only ever receives the public
 * view. Register/withdraw are inert: no registration endpoint exists (E7).
 */
export function AttendeeDashboard() {
  const { data: events, isPending, isError, error } = usePublicEvents();

  const openForRegistration = events?.filter((event) => event.registrationEnabled);

  return (
    <>
      <PageHeader
        title="Browse events"
        description="Events open for registration."
      />

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
            description="Events accepting registrations will be listed here."
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

                {/* Placeholder — registering is E7. */}
                <Button size="sm" disabled title="Not built yet" className="shrink-0">
                  Register
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
