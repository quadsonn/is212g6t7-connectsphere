import { attendanceBandLabel } from '@/lib/attendance-bands';
import { formatDate } from '@/lib/utils';
import type { ChangeRequestReview } from '@/types/api';

function Row({
  label,
  current,
  proposed,
  changed,
}: {
  label: string;
  current: React.ReactNode;
  proposed: React.ReactNode;
  changed: boolean;
}) {
  return (
    <tr className="border-t border-ink-100 align-top">
      <th scope="row" className="py-2.5 pr-3 text-left text-sm font-medium text-ink-800">
        {label}
      </th>
      <td className="py-2.5 pr-3 text-sm text-ink-700">{current}</td>
      <td className={changed ? 'py-2.5 text-sm font-medium text-ink-900' : 'py-2.5 text-sm text-ink-400'}>
        {changed ? proposed : 'No change'}
      </td>
    </tr>
  );
}

/**
 * US-38 AC-2 — the event as it is now, side by side with what the request
 * proposes. A field the request leaves alone says so, rather than repeating the
 * current value as if it were a proposal.
 */
export function ChangeRequestComparison({ review }: { review: ChangeRequestReview }) {
  const { request, event } = review;

  const currentLines = event.equipmentRequirements.filter((line) => line.equipmentId);
  const notFromCatalogue = event.equipmentRequirements.filter((line) => !line.equipmentId);

  // One row per catalogue item that appears on either side.
  const itemIds = request.equipmentChanged
    ? [
        ...new Set([
          ...currentLines.map((line) => line.equipmentId as string),
          ...request.equipment.map((line) => line.equipmentId),
        ]),
      ]
    : [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left">
        <thead className="text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Current</th>
            <th className="py-1 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label="Starts"
            current={event.proposedStart ? formatDate(event.proposedStart) : 'Not set'}
            proposed={request.proposedStart ? formatDate(request.proposedStart) : null}
            changed={request.proposedStart !== null}
          />
          <Row
            label="Ends"
            current={event.proposedEnd ? formatDate(event.proposedEnd) : 'Not set'}
            proposed={request.proposedEnd ? formatDate(request.proposedEnd) : null}
            changed={request.proposedEnd !== null}
          />
          <Row
            label="Expected attendance"
            current={
              event.expectedAttendance == null
                ? 'Not set'
                : attendanceBandLabel(event.expectedAttendance)
            }
            proposed={
              request.proposedAttendance == null
                ? null
                : attendanceBandLabel(request.proposedAttendance)
            }
            changed={request.proposedAttendance !== null}
          />

          {request.equipmentChanged ? (
            itemIds.map((itemId) => {
              const now = currentLines.find((line) => line.equipmentId === itemId);
              const next = request.equipment.find((line) => line.equipmentId === itemId);
              const name = now?.equipmentType ?? next?.equipment.type ?? itemId;

              const proposed = !next
                ? 'Remove'
                : !now
                  ? `Add — ${next.quantity}`
                  : next.quantity === now.quantity
                    ? `${next.quantity} (no change)`
                    : `${next.quantity}`;

              return (
                <Row
                  key={itemId}
                  label={`Equipment: ${name}`}
                  current={now ? now.quantity : 'None'}
                  proposed={proposed}
                  changed
                />
              );
            })
          ) : (
            <Row label="Equipment" current={equipmentSummary(currentLines)} proposed={null} changed={false} />
          )}
        </tbody>
      </table>

      {notFromCatalogue.length > 0 ? (
        <p className="mt-2 text-xs text-ink-500">
          Also on this event, not from the catalogue (a change request cannot alter these):{' '}
          {notFromCatalogue.map((line) => `${line.quantity} × ${line.equipmentType}`).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}

function equipmentSummary(lines: { equipmentType: string; quantity: number }[]): string {
  return lines.length > 0
    ? lines.map((line) => `${line.quantity} × ${line.equipmentType}`).join(', ')
    : 'None';
}
