import { Clock } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { formatDate } from '@/lib/utils';
import type { ChangeRequest, OrganiserRequestView } from '@/types/api';

function Row({ label, current, proposed }: { label: string; current: string; proposed: string }) {
  return (
    <tr className="border-t border-ink-100 align-top">
      <th scope="row" className="py-2 pr-3 text-left text-sm font-medium text-ink-800">
        {label}
      </th>
      <td className="py-2 pr-3 text-sm text-ink-500">{current}</td>
      <td className="py-2 text-sm font-medium text-ink-900">{proposed}</td>
    </tr>
  );
}

const equipmentSummary = (lines: { name: string; quantity: number }[]) =>
  lines.length > 0 ? lines.map((l) => `${l.quantity} × ${l.name}`).join(', ') : 'None';

/**
 * US-37 — the pending change request, beside the event's original details
 * (which stay as they are above it). Only the fields being changed are listed.
 */
export function PendingChangeRequest({
  event,
  request,
}: {
  event: OrganiserRequestView;
  request: ChangeRequest;
}) {
  const currentEquipment = (event.equipmentRequirements ?? [])
    .filter((r) => r.equipmentId)
    .map((r) => ({ name: r.equipmentType, quantity: r.quantity }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending change request</CardTitle>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-400">
          <Clock className="size-3.5" aria-hidden="true" />
          Pending
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">Reason</h3>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-900">{request.reason}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left">
            <thead className="text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Field</th>
                <th className="py-1 pr-3 font-medium">Current</th>
                <th className="py-1 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody>
              {request.proposedStart ? (
                <Row
                  label="Starts"
                  current={event.proposedStart ? formatDate(event.proposedStart) : 'Not set'}
                  proposed={formatDate(request.proposedStart)}
                />
              ) : null}
              {request.proposedEnd ? (
                <Row
                  label="Ends"
                  current={event.proposedEnd ? formatDate(event.proposedEnd) : 'Not set'}
                  proposed={formatDate(request.proposedEnd)}
                />
              ) : null}
              {request.proposedAttendance != null ? (
                <Row
                  label="Expected attendance"
                  current={
                    event.expectedAttendance == null
                      ? 'Not set'
                      : attendanceBandLabel(event.expectedAttendance)
                  }
                  proposed={attendanceBandLabel(request.proposedAttendance)}
                />
              ) : null}
              {request.equipmentChanged ? (
                <Row
                  label="Equipment"
                  current={equipmentSummary(currentEquipment)}
                  proposed={equipmentSummary(
                    request.equipment.map((l) => ({ name: l.equipment.type, quantity: l.quantity })),
                  )}
                />
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink-500">
          Submitted {formatDate(request.createdAt)}. Your event keeps its current details until this
          is reviewed.
        </p>
      </CardContent>
    </Card>
  );
}
