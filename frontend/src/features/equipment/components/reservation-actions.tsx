import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/api-client';
import type { EquipmentSuggestion } from '@/types/api';
import {
  useAlternatives,
  useReduceReservation,
  useReleaseReservation,
  useSuggestAlternative,
} from '../hooks/use-equipment';

type Mode = 'reduce' | 'release' | 'suggest' | null;

/**
 * US-45 — Technical Support resolve a shortage by hand, for one reservation:
 *   - reduce it to fewer units, or release it, with a required reason;
 *   - for a confirmed event, suggest an alternative item (only items free in
 *     the needed quantity are offered), which the Coordinator then decides.
 * Nothing is decided automatically; each change is recorded in the event's
 * history and the Coordinator is told (server-side).
 */
export function ReservationActions({
  reservationId,
  quantity,
  shortBy,
  canSuggest,
  openSuggestion,
}: {
  reservationId: string;
  quantity: number;
  shortBy: number;
  /** A confirmed event whose reservation is short. */
  canSuggest: boolean;
  openSuggestion: EquipmentSuggestion | null;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [count, setCount] = useState(String(Math.max(1, quantity - shortBy)));
  const [alternative, setAlternative] = useState('');
  const [reason, setReason] = useState('');

  const reduce = useReduceReservation();
  const release = useReleaseReservation();
  const suggest = useSuggestAlternative();

  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1;
  const alternatives = useAlternatives(reservationId, valid ? n : 0, mode === 'suggest');
  const active = mode === 'reduce' ? reduce : mode === 'release' ? release : suggest;

  const open = (next: Mode) => {
    setMode(next);
    setReason('');
    setAlternative('');
    setCount(String(next === 'suggest' ? Math.max(1, shortBy) : Math.max(1, quantity - shortBy)));
    reduce.reset();
    release.reset();
    suggest.reset();
  };

  const done = { onSuccess: () => setMode(null) };
  const submit = () => {
    const why = reason.trim();
    if (mode === 'reduce') reduce.mutate({ id: reservationId, quantity: n, reason: why }, done);
    if (mode === 'release') release.mutate({ id: reservationId, reason: why }, done);
    if (mode === 'suggest') {
      suggest.mutate({ id: reservationId, alternativeEquipmentId: alternative, quantity: n, reason: why }, done);
    }
  };

  const ready =
    reason.trim().length > 0 &&
    (mode === 'release' ||
      (mode === 'reduce' && valid && n < quantity) ||
      (mode === 'suggest' && valid && n <= quantity && alternative !== ''));

  return (
    <div className="space-y-3">
      {openSuggestion ? (
        <p className="text-xs text-ink-600">
          Suggested: {openSuggestion.quantity} × {openSuggestion.alternativeEquipment.type} — waiting
          for the Coordinator.
        </p>
      ) : null}

      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {quantity > 1 ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => open('reduce')}>
              Reduce
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => open('release')}>
            Release
          </Button>
          {canSuggest && !openSuggestion ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => open('suggest')}>
              Suggest alternative
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
          {mode !== 'release' ? (
            <Field
              label={mode === 'reduce' ? 'Reduce to' : 'Quantity of the alternative'}
              htmlFor={`${reservationId}-count`}
              required
              hint={
                mode === 'reduce'
                  ? `Fewer than the ${quantity} reserved.`
                  : `Takes the same number off this reservation (at most ${quantity}).`
              }
            >
              <Input
                id={`${reservationId}-count`}
                type="number"
                min={1}
                max={mode === 'reduce' ? quantity - 1 : quantity}
                step={1}
                className="w-32"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Field>
          ) : (
            <p className="text-sm text-ink-700">
              Releases all {quantity} reserved. The record is kept.
            </p>
          )}

          {mode === 'suggest' ? (
            <Field label="Alternative item" htmlFor={`${reservationId}-alternative`} required>
              <Select
                id={`${reservationId}-alternative`}
                value={alternative}
                onChange={(e) => setAlternative(e.target.value)}
              >
                <option value="">
                  {alternatives.isPending
                    ? 'Finding available items…'
                    : alternatives.data?.length
                      ? 'Choose an item…'
                      : 'No item has that many free'}
                </option>
                {alternatives.data?.map((item) => (
                  <option key={item.equipmentId} value={item.equipmentId}>
                    {item.type} — {item.availableQuantity} free
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Reason" htmlFor={`${reservationId}-reason`} required>
            <Textarea
              id={`${reservationId}-reason`}
              rows={2}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {active.error ? (
            <p role="alert" className="text-sm text-red-700">
              {apiErrorMessage(active.error, 'Could not save the change.')}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'release' ? 'danger' : 'primary'}
              disabled={!ready || active.isPending}
              onClick={submit}
            >
              {active.isPending
                ? 'Saving…'
                : mode === 'reduce'
                  ? 'Reduce reservation'
                  : mode === 'release'
                    ? 'Release reservation'
                    : 'Send suggestion'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
