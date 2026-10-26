import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDecideSubstitution } from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { EQUIPMENT_STATUS_STYLES } from '@/lib/status';
import type { UnavailableEquipment } from '@/types/api';

/**
 * Warns that equipment the event requested or reserved has been taken out of
 * service, so the arrangements need attention. The server derives this live
 * from each item's current status, so it appears and clears on its own. It
 * renders nothing when all equipment is available.
 *
 * Once the event is CONFIRMED, Technical Support also answers each item: a
 * replacement, or "no valid alternative". The event's own Coordinator
 * (`canDecide`) accepts the replacement, or declines to acknowledge the
 * problem — the event goes on either way, and a decline is final: the flag
 * stays, now acknowledged.
 */
export function EquipmentUnavailableNotice({
  items,
  canDecide = false,
}: {
  items: UnavailableEquipment[] | undefined;
  canDecide?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-semibold text-amber-900">Equipment needs attention</p>
            <p className="text-amber-800">
              Equipment this event requested or reserved is no longer available. The
              arrangements will need to be revisited.
            </p>
          </div>
          <ul className="space-y-2 text-amber-900">
            {items.map((item) => (
              <li key={item.reservationId}>
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-medium">
                    {item.quantity} × {item.equipmentType}
                  </span>
                  <span className="text-amber-700">
                    — {EQUIPMENT_STATUS_STYLES[item.equipmentStatus].label.toLowerCase()}
                    {item.reservationStatus === 'REQUESTED' ? ' · requested' : ' · reserved'}
                  </span>
                </div>
                <SubstitutionLine item={item} canDecide={canDecide} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Technical Support's answer for one item, with the Coordinator's choices. */
function SubstitutionLine({
  item,
  canDecide,
}: {
  item: UnavailableEquipment;
  canDecide: boolean;
}) {
  const substitution = item.substitution;
  if (!substitution) return null;

  const alternative = substitution.alternativeEquipment;

  if (substitution.status === 'DECLINED') {
    return (
      <p className="mt-1 text-amber-800">
        {alternative
          ? `Replacement (${item.quantity} × ${alternative.type}) declined`
          : 'No valid alternative'}{' '}
        — problem acknowledged by {substitution.decidedBy?.name ?? 'the Coordinator'}. The event
        goes ahead with the original reservation.
      </p>
    );
  }

  if (substitution.status !== 'PENDING') return null;

  return (
    <div className="mt-1 space-y-1.5 rounded-lg border border-amber-200 bg-white/60 p-2.5">
      <p className="text-amber-950">
        {alternative ? (
          <>
            <span className="font-medium">{substitution.suggestedBy.name}</span> suggests{' '}
            <span className="font-medium">
              {item.quantity} × {alternative.type}
            </span>
            {alternative.location ? ` (${alternative.location})` : ''} instead.
          </>
        ) : (
          <>
            <span className="font-medium">{substitution.suggestedBy.name}</span> found{' '}
            <span className="font-medium">no valid alternative</span>. Acknowledge the problem; the
            event goes ahead.
          </>
        )}
      </p>
      {canDecide ? <DecideButtons id={substitution.id} hasAlternative={Boolean(alternative)} /> : null}
    </div>
  );
}

function DecideButtons({ id, hasAlternative }: { id: string; hasAlternative: boolean }) {
  const decide = useDecideSubstitution();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasAlternative ? (
          <Button
            type="button"
            size="sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id, action: 'accept' })}
          >
            Accept replacement
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id, action: 'decline' })}
        >
          {hasAlternative ? 'Decline and acknowledge' : 'Acknowledge'}
        </Button>
      </div>
      {decide.error ? (
        <p role="alert" className="text-xs text-red-700">
          {apiErrorMessage(decide.error, 'Could not record your answer.')}
        </p>
      ) : null}
    </>
  );
}
