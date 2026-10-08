import { formatDateRange } from '@/lib/utils';
import type { BookingConflict } from '@/types/api';

/**
 * What is in the way of a slot (US-21 AC-4/AC-5): other bookings by event
 * name, and (US-16) blocked-out periods by their reason.
 */
export function ConflictList({ conflicts }: { conflicts: BookingConflict[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {conflicts.map((c) => (
        <li key={c.bookingId ?? c.blockId} className="text-sm">
          <span className="font-medium">
            {c.kind === 'BLOCK' ? `Blocked out — ${c.reason}` : (c.eventName ?? 'Unnamed event')}
          </span>
          {' · '}
          {formatDateRange(c.start, c.end)}
        </li>
      ))}
    </ul>
  );
}
