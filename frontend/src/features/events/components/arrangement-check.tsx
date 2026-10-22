import { CheckCircle2, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateRange } from '@/lib/utils';
import type { ArrangementCheck } from '@/types/api';

/**
 * US-48 — the event's arrangements checked against the change request's
 * proposed details, for the Coordinator deciding it.
 *
 * AC-4: what still works and what would conflict, with the reason for each
 * conflict (AC-2 venues, AC-3 equipment). AC-6: what approving would move to
 * the new details. Capacity shortfalls are shown separately as warnings by
 * the page — they never block approval. Read-only: nothing here acts.
 */
export function ArrangementCheckPanel({ check }: { check: ArrangementCheck }) {
  const moving = check.venueBookings.filter((b) => b.moves);
  const nothingChecked =
    check.works.length === 0 && check.conflicts.length === 0 && moving.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arrangement check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {nothingChecked ? (
          <p className="text-ink-600">
            This request moves no venue booking or equipment reservation, so there is nothing to
            re-check.
          </p>
        ) : check.canApprove ? (
          <p className="flex items-center gap-2 font-medium text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Everything still works with the proposed details.
          </p>
        ) : (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <p className="flex items-center gap-2 font-medium">
              <XCircle className="size-4" aria-hidden="true" />
              {check.conflicts.length} arrangement{check.conflicts.length === 1 ? '' : 's'} would
              conflict
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="Conflicts">
              {check.conflicts.map((conflict, i) => (
                <li key={i}>
                  <span className="font-medium">{conflict.label}:</span> {conflict.reason}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              Approve is unavailable until these are resolved. Reject the request with a reason, or
              re-check once the arrangements change.
            </p>
          </div>
        )}

        {check.works.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Still works</p>
            <ul className="mt-1 space-y-0.5" aria-label="Still works">
              {check.works.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-ink-800">
                  <CheckCircle2 className="size-3.5 text-emerald-700" aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {moving.length > 0 || check.equipmentReservations.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
              If you approve, these move to the new details
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-800" aria-label="Will move">
              {moving.map((b) => (
                <li key={b.bookingId}>
                  Venue booking at {b.venueName ?? 'the booked venue'}:{' '}
                  {formatDateRange(b.current.start, b.current.end)} →{' '}
                  {formatDateRange(b.proposed.start, b.proposed.end)}
                </li>
              ))}
              {check.equipmentReservations.map((r) => (
                <li key={r.equipmentId}>
                  {r.quantity} × {r.equipmentType}: {formatDateRange(r.current.start, r.current.end)}{' '}
                  → {formatDateRange(r.proposed.start, r.proposed.end)}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-500">
              Each is rebooked for the new time and the original released afterwards. Approvals carry
              over; Venue Staff and Technical Support are not asked again.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
