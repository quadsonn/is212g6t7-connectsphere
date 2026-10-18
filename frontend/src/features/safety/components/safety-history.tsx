import { Badge } from '@/components/ui/badge';
import { cn, formatDateTime } from '@/lib/utils';
import type { SafetyOutcome, SafetyReview } from '@/types/api';

const OUTCOME_STYLES: Record<SafetyOutcome, { label: string; className: string }> = {
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  CHANGES_REQUESTED: {
    label: 'Changes requested',
    className: 'bg-amber-50 text-amber-900 ring-amber-400',
  },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-red-300' },
};

const ARRANGEMENT_LABELS = {
  VENUE_BOOKING: 'venue booking',
  EQUIPMENT_RESERVATION: 'equipment reservation',
} as const;

/** The four factors the Safety Officer comments on, in the order they appear. */
const FACTORS = [
  ['emergencyAccessComment', 'Emergency access'],
  ['crowdMovementComment', 'Crowd movement'],
  ['equipmentPlacementComment', 'Equipment placement'],
  ['accessibilityComment', 'Accessibility'],
] as const;

/**
 * Every safety check of an event, newest first, with who made it, when, why
 * and what they noted on each factor. Earlier checks are never replaced by a
 * later one, so the whole trail stays here.
 */
export function SafetyHistory({ reviews }: { reviews: SafetyReview[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-ink-500">No safety check has been recorded yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {[...reviews].reverse().map((review) => {
        const outcome = OUTCOME_STYLES[review.outcome];
        const noted = FACTORS.filter(([key]) => review[key]);

        return (
          <li key={review.id} className="rounded-lg border border-ink-200 p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge srPrefix="Safety outcome" className={cn(outcome.className)}>
                {outcome.label}
              </Badge>
              <span className="text-xs text-ink-500">
                {review.officer.name} · {formatDateTime(review.createdAt)}
              </span>
            </div>

            {review.reason ? (
              <p className="mt-2 text-sm text-ink-900">
                <span className="font-medium">Reason: </span>
                {review.reason}
              </p>
            ) : null}

            {review.returnStage ? (
              <p className="mt-1 text-sm text-ink-700">
                Returned to {review.returnStage.toLowerCase()} planning
                {review.affectedArrangements.length > 0
                  ? `; the ${review.affectedArrangements
                      .map((a) => ARRANGEMENT_LABELS[a])
                      .join(' and ')} is flagged for re-review.`
                  : '.'}
              </p>
            ) : review.outcome === 'REJECTED' && review.affectedArrangements.length > 0 ? (
              <p className="mt-1 text-sm text-ink-700">
                The whole plan is flagged: the{' '}
                {review.affectedArrangements.map((a) => ARRANGEMENT_LABELS[a]).join(' and ')} must be
                reworked and re-reviewed.
              </p>
            ) : null}

            {review.resubmittedAt ? (
              <div className="mt-3 rounded-lg bg-ink-50 p-3">
                <p className="text-xs text-ink-500">
                  The Coordinator sent it back for a new check on{' '}
                  {formatDateTime(review.resubmittedAt)}.
                </p>
                {review.resubmissionComment ? (
                  <p className="mt-1 text-sm text-ink-900">
                    <span className="font-medium">Coordinator’s comment: </span>
                    {review.resubmissionComment}
                  </p>
                ) : null}
              </div>
            ) : null}

            {noted.length > 0 ? (
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {noted.map(([key, label]) => (
                  <div key={key}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-sm text-ink-800">{review[key]}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
