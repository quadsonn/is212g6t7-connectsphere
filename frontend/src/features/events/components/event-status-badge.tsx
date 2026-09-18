import { Badge } from '@/components/ui/badge';
import { EVENT_STATUS_STYLES } from '@/lib/status';
import type { EventStatus } from '@/types/api';

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const style = EVENT_STATUS_STYLES[status];

  return (
    <Badge className={style.className} srPrefix="Status">
      {style.label}
    </Badge>
  );
}
