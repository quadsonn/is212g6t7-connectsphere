import { BOOKING_STATUS_STYLES } from '@/lib/status';
import { humanise } from '@/lib/utils';
import type { BookingDecision } from '@/types/api';

/**
 * US-23 AC-4/AC-6 — every decision on a request, oldest first, with who made
 * it and when. A reversal appears as its own entry beneath the decision it
 * overturned; nothing earlier is ever rewritten.
 */
export function BookingDecisionHistory({ decisions }: { decisions: BookingDecision[] }) {
  if (decisions.length === 0) {
    return <p className="text-sm text-ink-500">No decision yet — waiting on Venue Staff.</p>;
  }

  return (
    <ol className="space-y-3 border-l border-ink-200 pl-4">
      {decisions.map((d) => (
        <li key={d.id} className="text-sm">
          <p className="font-medium text-ink-900">
            {d.kind === 'REVIEW_RESOLVED' ? (
              // US-51: a resolved conflict flag; the status did not change.
              <>Conflict review resolved · still {BOOKING_STATUS_STYLES[d.outcome].label.toLowerCase()}</>
            ) : (
              <>
                {d.kind === 'REVERSAL' ? 'Reversed to ' : ''}
                {BOOKING_STATUS_STYLES[d.outcome].label}
              </>
            )}
          </p>
          {d.reason ? <p className="mt-0.5 text-ink-800">{d.reason}</p> : null}
          <p className="mt-1 text-xs text-ink-500">
            {d.decidedBy.name} ({humanise(d.decidedBy.role)}) ·{' '}
            {new Date(d.createdAt).toLocaleString()}
          </p>
        </li>
      ))}
    </ol>
  );
}
