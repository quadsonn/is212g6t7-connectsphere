import { Badge } from '@/components/ui/badge';
import { useVenueArrangement } from '../hooks/use-bookings';

/**
 * US-53 AC-5 — "Venue arranged" only when every active booking on the event
 * is approved, as the server derives it; otherwise how many are approved so
 * far. Nothing is shown before the event has any active booking.
 */
export function VenueArrangementBadge({ eventId }: { eventId: string }) {
  const { data } = useVenueArrangement(eventId);
  if (!data || data.activeBookings === 0) return null;

  return data.arranged ? (
    <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Venue arranged</Badge>
  ) : (
    <Badge className="bg-amber-50 text-amber-900 ring-amber-400">
      {data.approvedBookings} of {data.activeBookings} venues approved
    </Badge>
  );
}
