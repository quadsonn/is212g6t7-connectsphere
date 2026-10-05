import { Badge } from '@/components/ui/badge';
import { BOOKING_STATUS_STYLES } from '@/lib/status';
import type { BookingStatus } from '@/types/api';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const style = BOOKING_STATUS_STYLES[status];
  return (
    <Badge className={style.className} srPrefix="Booking status">
      {style.label}
    </Badge>
  );
}
