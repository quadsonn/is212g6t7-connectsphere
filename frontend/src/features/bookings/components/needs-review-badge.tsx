import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { NEEDS_REVIEW_LABEL } from '../needs-review';

/**
 * US-51 AC-5 — shown beside the status of a flagged booking. `solid` makes it
 * the loudest thing on a row, for lists where it must stand out from softer
 * red urgency badges.
 */
export function NeedsReviewBadge({ solid = false }: { solid?: boolean }) {
  return (
    <Badge
      className={solid ? 'bg-red-600 font-semibold text-white ring-red-600' : 'bg-red-50 text-red-800 ring-red-300'}
      srPrefix="Review"
    >
      <AlertTriangle className="size-3" aria-hidden="true" />
      {NEEDS_REVIEW_LABEL}
    </Badge>
  );
}
