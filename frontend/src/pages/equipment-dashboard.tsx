import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useEventRequirementsList } from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type { EventRequirements } from '@/types/api';

/** US-31 AC-1/AC-2 — a one-line preview of each source the event has. */
function requirementSummary(event: EventRequirements): { label: string; text: string }[] {
  const parts: { label: string; text: string }[] = [];
  if (event.organiserEquipmentNeeds) {
    parts.push({ label: 'Organiser', text: event.organiserEquipmentNeeds });
  }
  if (event.coordinatorRequirements.length > 0) {
    parts.push({
      label: 'Coordinator',
      text: event.coordinatorRequirements
        .map((row) => `${row.quantity} × ${row.equipmentType}`)
        .join(', '),
    });
  }
  if (event.technicalSupportNeeds) {
    parts.push({ label: 'Technical support', text: event.technicalSupportNeeds });
  }
  return parts;
}

/**
 * US-31 — REAL data, GET /equipment/requirements. Submitted events with at
 * least one requirement source — the Organiser's equipment needs, or the
 * Coordinator's requirement rows or technical support notes (AC-4); drafts
 * never appear.
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
                  onClick={() => navigate(`/equipment/requirements/${event.eventId}`)}
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
                  <dl className="mt-2 space-y-1 text-sm">
                    {requirementSummary(event).map(({ label, text }) => (
                      <div key={label} className="flex gap-2">
                        <dt className="shrink-0 text-ink-500">{label}:</dt>
                        <dd className="line-clamp-2 whitespace-pre-line text-ink-700">{text}</dd>
                      </div>
                    ))}
                  </dl>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
