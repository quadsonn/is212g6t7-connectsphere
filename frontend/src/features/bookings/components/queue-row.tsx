import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { cn, formatDateRange, formatDayMonth } from '@/lib/utils';
import type { BookingQueueEntry } from '@/types/api';
import { type Urgency, type UrgencyLevel } from '../queue-urgency';
import { BookingStatusBadge } from './booking-status-badge';
import { NeedsReviewBadge } from './needs-review-badge';

/** Only critical and soon rows get a left bar; upcoming stays quiet. */
const BAR: Record<UrgencyLevel, string> = {
  critical: 'border-l-red-500',
  soon: 'border-l-amber-500',
  upcoming: 'border-l-transparent',
};

const BADGE: Record<Exclude<UrgencyLevel, 'upcoming'>, string> = {
  critical: 'bg-red-50 text-red-800 ring-red-300',
  soon: 'bg-amber-50 text-amber-900 ring-amber-300',
};

/** AC-5: a badge when the event is close, muted text when it is this week. */
export function UrgencyIndicator({ urgency }: { urgency: Urgency }) {
  if (urgency.level === 'upcoming') {
    return <span className="text-xs text-ink-500">{urgency.label}</span>;
  }
  return (
    <Badge className={BADGE[urgency.level]} srPrefix="Priority">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {urgency.label}
    </Badge>
  );
}

/** "10 – 49 people · Cora Coordinator (Coordinator) · submitted 3 Oct". */
function metaLine(entry: BookingQueueEntry): string {
  return [
    entry.expectedAttendance != null ? `${attendanceBandLabel(entry.expectedAttendance)} people` : null,
    // Only Coordinators submit requests (US-21); a hold has no requester.
    entry.requestedBy ? `${entry.requestedBy.name} (Coordinator)` : null,
    `submitted ${formatDayMonth(entry.createdAt)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One request in the Venue Staff queue (US-22). The whole row is a link to
 * its details, so it works by keyboard and opens in a new tab as links do.
 * The status badge is left off in the Pending view, where it says nothing.
 */
export function QueueRow({
  entry,
  urgency,
  showStatus,
}: {
  entry: BookingQueueEntry;
  urgency: Urgency | null;
  showStatus: boolean;
}) {
  return (
    <li>
      <Link
        to={`/venues/bookings/${entry.id}`}
        className={cn(
          'flex items-center gap-3 border-l-4 border-l-transparent px-5 py-4 transition-colors hover:bg-ink-50',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
          urgency && BAR[urgency.level],
          // US-44: released bookings hold nothing; kept in the history, greyed.
          entry.status === 'RELEASED' && 'opacity-60',
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">{entry.event.name ?? 'Untitled event'}</p>
            {/* US-51: the loudest thing on the row. */}
            {entry.needsReview ? <NeedsReviewBadge solid /> : null}
            {urgency ? <UrgencyIndicator urgency={urgency} /> : null}
            {showStatus ? <BookingStatusBadge status={entry.status} /> : null}
          </div>
          <p className="text-sm text-ink-700">
            {entry.venue.name} · {formatDateRange(entry.start, entry.end, { localMarker: false })}
          </p>
          <p className="text-xs text-ink-500">{metaLine(entry)}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden="true" />
      </Link>
    </li>
  );
}
