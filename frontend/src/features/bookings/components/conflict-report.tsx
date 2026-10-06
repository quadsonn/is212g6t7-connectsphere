import { AlertTriangle, Ban, CircleCheck } from 'lucide-react';

import { formatDateRange } from '@/lib/utils';
import type { BookingConflictReport } from '@/types/api';

/**
 * US-24 — what overlaps this request, for the Venue Staff member deciding it.
 *
 * Hard conflicts (approved bookings, blocked-out periods) are red: they stop
 * an approval. Soft conflicts (other pending requests) are amber: a warning
 * only. Each names the event (AC-4) and its time range.
 */
export function ConflictReportPanel({ report }: { report: BookingConflictReport }) {
  const { hardConflicts, softConflicts, blocks } = report;

  if (hardConflicts.length === 0 && softConflicts.length === 0 && blocks.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-800">
        <CircleCheck className="size-4" aria-hidden="true" />
        No other bookings overlap this time.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {hardConflicts.length > 0 || blocks.length > 0 ? (
        <section
          aria-labelledby="hard-conflicts"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900"
        >
          <h3 id="hard-conflicts" className="flex items-center gap-2 text-sm font-semibold">
            <Ban className="size-4" aria-hidden="true" />
            Conflicts with confirmed bookings — cannot be approved
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {hardConflicts.map((c) => (
              <li key={c.bookingId}>
                <span className="font-medium">{c.eventName ?? 'Unnamed event'}</span>
                {' · '}
                {formatDateRange(c.start, c.end)}
              </li>
            ))}
            {blocks.map((b) => (
              <li key={b.blockId}>
                <span className="font-medium">Blocked out — {b.reason}</span>
                {' · '}
                {formatDateRange(b.start, b.end)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Reject this request, or ask the Coordinator to request a different time.
          </p>
        </section>
      ) : null}

      {softConflicts.length > 0 ? (
        <section
          aria-labelledby="soft-conflicts"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <h3 id="soft-conflicts" className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Other pending requests overlap
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {softConflicts.map((c) => (
              <li key={c.bookingId}>
                <span className="font-medium">{c.eventName ?? 'Unnamed event'}</span>
                {' · '}
                {formatDateRange(c.start, c.end)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            You can still approve this one. Once you do, those requests can no longer be approved
            for this time.
          </p>
        </section>
      ) : null}
    </div>
  );
}
