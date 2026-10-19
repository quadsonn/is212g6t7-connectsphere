import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import {
  useAssignableCoordinators,
  useAssignRequest,
  useQueuedRequest,
} from '@/features/assignments/hooks/use-assignments';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange, formatDateTime } from '@/lib/utils';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children || '—'}</dd>
    </div>
  );
}

/** A queued request opened for review, with the control to assign it. */
export function LeadQueuedRequest() {
  const { id } = useParams<{ id: string }>();
  const { data: request, isPending, isError, error } = useQueuedRequest(id);
  const { data: coordinators = [] } = useAssignableCoordinators();
  const assign = useAssignRequest();
  const [coordinatorId, setCoordinatorId] = useState('');

  const assigned = assign.data;

  return (
    <>
      <PageHeader
        title={request?.name ?? 'Request'}
        description="Review the request, then give it to a Coordinator."
        action={
          <LinkButton to="/lead/unassigned" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to queue
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading request…" /> : null}
      {isError && !assigned ? (
        <ErrorState
          message={apiErrorMessage(
            error,
            'This request is not in the queue — it may already have been assigned.',
          )}
        />
      ) : null}

      {request ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label="Name">{request.name}</Detail>
                <Detail label="Category">{request.category}</Detail>
                <Detail label="Preferred date and time">
                  {formatDateRange(request.proposedStart, request.proposedEnd)}
                </Detail>
                <Detail label="Expected attendance">{request.expectedAttendance}</Detail>
                <Detail label="Preferred layout">
                  {request.preferredLayout
                    ? `${request.preferredLayout}${request.layoutNotes ? ` — ${request.layoutNotes}` : ''}`
                    : null}
                </Detail>
                <Detail label="Submitted">
                  {request.submittedAt ? formatDateTime(request.submittedAt) : null}
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label="Purpose">{request.purpose}</Detail>
                </div>
                <div className="sm:col-span-2">
                  <Detail label="Description">{request.description}</Detail>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raised by</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Detail label="Organiser">{request.organiser.name}</Detail>
                <Detail label="Email">{request.organiser.email}</Detail>
                <Detail label="Client organisation">{request.organisation}</Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assign a Coordinator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {assigned ? (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    Assigned to {assigned.coordinator.name}. They have been notified and the
                    request has left the queue.
                  </span>
                </div>
              ) : (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (id && coordinatorId) assign.mutate({ id, coordinatorId });
                  }}
                >
                  <div className="w-full max-w-xs">
                    <Field label="Coordinator" htmlFor="assign-coordinator">
                      <Select
                        id="assign-coordinator"
                        value={coordinatorId}
                        onChange={(e) => setCoordinatorId(e.target.value)}
                      >
                        <option value="">Choose a Coordinator…</option>
                        {coordinators.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button type="submit" disabled={!coordinatorId || assign.isPending}>
                    {assign.isPending ? 'Assigning…' : 'Assign'}
                  </Button>
                </form>
              )}
              {assign.error ? (
                <ErrorState message={apiErrorMessage(assign.error, 'Could not assign this request.')} />
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
