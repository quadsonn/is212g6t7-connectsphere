import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useEventRequirementsList } from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';

/**
 * US-31 — REAL data, GET /equipment/requirements. Submitted events that have
 * equipment or technical requirements (AC-4); drafts never appear.
 */
export function EquipmentDashboard() {
  const { data: events, isPending, isError, error } = useEventRequirementsList();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Event requirements"
        description="Equipment and technical support requested for submitted events."
      />

      <Card>
        <CardHeader>
          <CardTitle>Events with requirements</CardTitle>
          {events ? (
            <span className="text-sm text-ink-500">{events.length} total</span>
          ) : null}
        </CardHeader>

        {isPending ? <TableSkeleton rows={3} /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load event requirements.')} />
          </CardContent>
        ) : null}

        {/* AC-3: nothing recorded is said plainly, not left blank. */}
        {events && events.length === 0 ? (
          <EmptyState
            title="No requirements recorded"
            description="No submitted event has equipment or technical requirements recorded yet."
          />
        ) : null}

        {events && events.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {events.map((event) => (
              <li key={event.eventId}>
                <button
                  type="button"
                  onClick={() => navigate(`/equipment/events/${event.eventId}`)}
                  className="block w-full px-5 py-4 text-left hover:bg-ink-50"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-medium text-ink-900">{event.name ?? 'Untitled event'}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatDateRange(event.proposedStart, event.proposedEnd)}
                  </p>
                  {/* AC-2: what was requested, not just that something was. */}
                  <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-ink-700">
                    {event.organiserEquipmentNeeds}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
