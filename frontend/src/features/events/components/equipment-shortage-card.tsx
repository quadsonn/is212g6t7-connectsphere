import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ShortBadge } from '@/features/equipment/components/equipment-condition';
import {
  useAcceptSuggestion,
  useDeclineSuggestion,
} from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type { EquipmentSuggestion, EventReservationShortage } from '@/types/api';

function SuggestionDecision({ suggestion, shortType }: { suggestion: EquipmentSuggestion; shortType: string }) {
  const accept = useAcceptSuggestion();
  const decline = useDeclineSuggestion();
  const error = accept.error ?? decline.error;
  const busy = accept.isPending || decline.isPending;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
      <p className="text-ink-900">
        Technical Support suggest{' '}
        <span className="font-medium">
          {suggestion.quantity} × {suggestion.alternativeEquipment.type}
        </span>{' '}
        in place of {suggestion.quantity} × {shortType}.
      </p>
      <p className="text-ink-600">Reason: {suggestion.reason}</p>
      {error ? (
        <p role="alert" className="mt-1 text-red-700">
          {apiErrorMessage(error, 'Could not record your decision.')}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => accept.mutate(suggestion.id)}>
          {accept.isPending ? 'Accepting…' : 'Accept'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => decline.mutate(suggestion.id)}
        >
          {decline.isPending ? 'Declining…' : 'Decline'}
        </Button>
      </div>
    </div>
  );
}

/**
 * US-45 — the event's reservations the working units no longer cover, each
 * flagged "Short by N". The server derives it live, so the card clears on its
 * own once the reservations fit again. The Coordinator (`canDecide`) also
 * sees Technical Support's answer: an alternative to accept or decline, or
 * that there is no valid alternative.
 * Renders nothing when nothing is short.
 */
export function EquipmentShortageCard({
  items,
  canDecide = false,
}: {
  items: EventReservationShortage[] | undefined;
  canDecide?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-semibold text-amber-900">Equipment shortage</p>
            <p className="text-amber-800">
              Some units of equipment reserved for this event are damaged or under maintenance, and
              the rest can't cover every reservation. Nothing has been cancelled.
            </p>
          </div>
          <ul className="space-y-3 text-amber-900">
            {items.map((item) => (
              <li key={item.reservationId}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {item.quantity} × {item.equipmentType}
                  </span>
                  <ShortBadge shortBy={item.shortBy} />
                  <span className="text-amber-700">{formatDateRange(item.start, item.end)}</span>
                </div>
                {canDecide && item.openSuggestion ? (
                  <SuggestionDecision suggestion={item.openSuggestion} shortType={item.equipmentType} />
                ) : null}
                {canDecide && item.noAlternative ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
                    <p className="font-medium text-ink-900">
                      Technical Support found no valid alternative.
                    </p>
                    <p className="text-ink-600">Reason: {item.noAlternative.reason}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
