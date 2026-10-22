import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useAssignableCoordinators,
  useAssignmentsOverview,
  useReassignEvent,
} from '@/features/assignments/hooks/use-assignments';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { ContactSummary, CoordinatorAssignments } from '@/types/api';

type AssignedEvent = CoordinatorAssignments['events'][number];

/** Inline reassign control: pick a different Coordinator, then confirm. */
function ReassignControl({
  event,
  current,
  coordinators,
  onDone,
}: {
  event: AssignedEvent;
  current: ContactSummary;
  coordinators: ContactSummary[];
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const reassign = useReassignEvent();
  const others = coordinators.filter((c) => c.id !== current.id);
  const selectId = `reassign-${event.id}`;

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Reassign
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!target) return;
        reassign.mutate(
          { id: event.id, coordinatorId: target },
          {
            onSuccess: (result) =>
              onDone(
                `"${event.name ?? 'Event'}" moved from ${current.name} to ${result.coordinator.name}. Both have been notified.`,
              ),
          },
        );
      }}
    >
      <div className="w-48">
        <Field label="Reassign to" htmlFor={selectId}>
          <Select id={selectId} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={!target || reassign.isPending}>
        {reassign.isPending ? 'Moving…' : 'Confirm'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {reassign.error ? (
        <ErrorState
          className="w-full"
          message={apiErrorMessage(reassign.error, 'Could not reassign this event.')}
        />
      ) : null}
    </form>
  );
}

/** Every Coordinator with their active events, and the means to rebalance them. */
export function LeadAssignments() {
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const { data: coordinators = [] } = useAssignableCoordinators();
  const { data: groups, isPending, isError, error } = useAssignmentsOverview(filter);

  return (
    <>
      <PageHeader
        title="Coordinator assignments"
        description="Each Coordinator's active events — not completed, cancelled or rejected."
      />

      <div className="mb-4 max-w-xs">
        <Field label="Coordinator" htmlFor="assignments-filter">
          <Select
            id="assignments-filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setNotice('');
            }}
          >
            <option value="">All Coordinators</option>
            {coordinators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {isPending ? <TableSkeleton /> : null}
      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load the assignments.')} />
      ) : null}

      {groups && groups.length === 0 ? (
        <Card>
          <EmptyState
            title="No Coordinators"
            description="There are no Event Coordinator accounts to show."
          />
        </Card>
      ) : null}

      <div className="space-y-4">
        {groups?.map((group) => (
          <Card key={group.coordinator.id}>
            <CardHeader>
              <CardTitle>{group.coordinator.name}</CardTitle>
              <p className="text-sm text-ink-500">
                {group.activeCount} active {group.activeCount === 1 ? 'event' : 'events'}
              </p>
            </CardHeader>
            {group.events.length === 0 ? (
              <CardContent>
                <p className="text-sm text-ink-500">No active events.</p>
              </CardContent>
            ) : (
              <ul className="divide-y divide-ink-100">
                {group.events.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{event.name ?? 'Untitled event'}</p>
                      <p className="text-xs text-ink-500">
                        {event.eventDate ? formatDate(event.eventDate) : 'Date not set'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <EventStatusBadge status={event.status} />
                      <ReassignControl
                        event={event}
                        current={group.coordinator}
                        coordinators={coordinators}
                        onDone={setNotice}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
