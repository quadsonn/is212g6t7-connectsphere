import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { NEEDS_REVIEW_LABEL } from '../needs-review';

/** US-51 AC-5 — shown beside the status of a flagged booking. */
export function NeedsReviewBadge() {
  return (
    <Badge className="bg-red-50 text-red-800 ring-red-300" srPrefix="Review">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {NEEDS_REVIEW_LABEL}
    </Badge>
  );
}
