import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type { TechnicalSupportStaffOption } from '@/types/api';
import { useSetTechnicalSupport, useTechnicalSupportAssignment } from '../hooks/use-events';

/**
 * US-61 — the assignment screen: the Coordinator gives an event requiring
 * on-site support one Technical Support member (AC-1). A member already
 * assigned to an overlapping event is shown with that event and cannot be
 * chosen (AC-2); when nobody is free the screen says so (AC-4). The server
 * enforces all three, so a member taken in the meantime is refused there and
 * its reason shown here.
 *
 * `editable` is true for the event's own Coordinator; anyone else sees the
 * assignee only.
 */
export function TechnicalSupportCard({ eventId, editable }: { eventId: string; editable: boolean }) {
  const { data: view, isPending, isError, error } = useTechnicalSupportAssignment(eventId);
  const setAssignee = useSetTechnicalSupport(eventId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Technical support staff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? <LoadingState label="Loading technical support…" /> : null}
        {isError ? (
          <ErrorState message={apiErrorMessage(error, 'Could not load technical support.')} />
        ) : null}

        {view ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-800">
                {view.assignee ? (
                  <>
                    Assigned: <span className="font-medium text-ink-900">{view.assignee.name}</span>{' '}
                    <span className="text-ink-500">({view.assignee.email})</span>
                  </>
                ) : (
                  'No one is assigned yet.'
                )}
              </p>
              {editable && view.assignable && view.assignee ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={setAssignee.isPending}
                  onClick={() => setAssignee.mutate(null)}
                >
                  Remove
                </Button>
              ) : null}
            </div>

            {!view.requiresTechnicalSupport ? (
              <p className="text-sm text-ink-500">
                This event has no technical support needs recorded. Record them under Technical
                requirements to assign someone.
              </p>
            ) : null}

            {/* AC-4: said plainly on the assignment screen. */}
            {view.noneAvailable && view.message ? (
              <p
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {view.message}
              </p>
            ) : null}

            {setAssignee.error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                {apiErrorMessage(setAssignee.error, 'Could not assign technical support.')}
              </p>
            ) : null}

            {editable && view.requiresTechnicalSupport && view.assignable && view.staff.length > 0 ? (
              <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                {view.staff.map((member) => (
                  <StaffRow
                    key={member.id}
                    member={member}
                    assigned={view.assignee?.id === member.id}
                    busy={setAssignee.isPending}
                    onAssign={() => setAssignee.mutate(member.id)}
                  />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StaffRow({
  member,
  assigned,
  busy,
  onAssign,
}: {
  member: TechnicalSupportStaffOption;
  assigned: boolean;
  busy: boolean;
  onAssign: () => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">{member.name}</p>
        <p className="text-xs text-ink-500">{member.email}</p>
        {/* AC-2: the conflict, before anything is attempted. */}
        {member.conflicts.map((conflict) => (
          <p key={conflict.eventId} className="mt-1 text-xs text-red-700">
            Already assigned to {conflict.name ?? 'an event'},{' '}
            {formatDateRange(conflict.start, conflict.end)}
          </p>
        ))}
      </div>
      {assigned ? (
        <span className="text-xs font-medium text-ink-700">Assigned</span>
      ) : member.available ? (
        <Button type="button" size="sm" disabled={busy} onClick={onAssign} aria-label={`Assign ${member.name}`}>
          Assign
        </Button>
      ) : (
        <span className="text-xs font-medium text-red-700">Unavailable</span>
      )}
    </li>
  );
}
