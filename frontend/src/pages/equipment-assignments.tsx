import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { useMyTechnicalSupportAssignments } from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, humanise } from '@/lib/utils';
import type { TechnicalSupportAssignment } from '@/types/api';

/**
 * US-61 AC-3 — REAL data, GET /technical-support/assignments. The events the
 * signed-in Technical Support member is assigned to, soonest first, each with
 * its date, time, venue and technical requirements.
 */
export function EquipmentAssignments() {
  const { data: assignments, isPending, isError, error } = useMyTechnicalSupportAssignments();

  return (
    <>
      <PageHeader
        title="My assignments"
        description="Events you are assigned to as on-site technical support."
      />

      <Card>
        <CardHeader>
          <CardTitle>Assigned events</CardTitle>
          {assignments ? (
            <span className="text-sm text-ink-500">{assignments.length} total</span>
          ) : null}
        </CardHeader>

        {isPending ? <TableSkeleton rows={3} /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load your assignments.')} />
          </CardContent>
        ) : null}

        {assignments && assignments.length === 0 ? (
          <EmptyState
            title="No assignments"
            description="You are not assigned to any upcoming event yet."
          />
        ) : null}

        {assignments && assignments.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {assignments.map((a) => (
              <AssignmentRow key={a.eventId} assignment={a} />
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}

function AssignmentRow({ assignment: a }: { assignment: TechnicalSupportAssignment }) {
  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          to={`/equipment/requirements/${a.eventId}`}
          className="font-medium text-ink-900 hover:underline"
        >
          {a.name ?? 'Untitled event'}
        </Link>
        <EventStatusBadge status={a.status} />
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 text-ink-500">Date and time:</dt>
          <dd className="text-ink-700">{formatDateRange(a.proposedStart, a.proposedEnd)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-ink-500">Venue:</dt>
          <dd className="text-ink-700">
            {a.venues.length > 0
              ? a.venues
                  .map((v) => `${v.venueName ?? 'Unnamed venue'} (${humanise(v.status).toLowerCase()})`)
                  .join(', ')
              : 'No venue booked yet'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-ink-500">Technical support:</dt>
          <dd className="whitespace-pre-line text-ink-700">{a.technicalSupportNeeds ?? 'None recorded'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-ink-500">Equipment:</dt>
          <dd className="text-ink-700">
            {a.coordinatorRequirements.length > 0
              ? a.coordinatorRequirements.map((r) => `${r.quantity} × ${r.equipmentType}`).join(', ')
              : 'None recorded'}
          </dd>
        </div>
        {a.organiserEquipmentNeeds ? (
          <div className="flex gap-2">
            <dt className="shrink-0 text-ink-500">Organiser asked for:</dt>
            <dd className="whitespace-pre-line text-ink-700">{a.organiserEquipmentNeeds}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}
