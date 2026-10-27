import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type {
  Equipment,
  EquipmentCondition,
  EquipmentStatus,
  UpcomingReservation,
} from '@/types/api';
import { useChangeEquipmentStatus, useUpcomingReservations } from '../hooks/use-equipment';
import { conditionText } from '../lib/condition';

interface Move {
  from: EquipmentStatus;
  to: EquipmentStatus;
  action: string;
}

/** The moves offered, in order, and the verb for each. */
const MOVES: Move[] = [
  { from: 'OPERATIONAL', to: 'OUT_OF_SERVICE', action: 'Mark as damaged' },
  { from: 'OPERATIONAL', to: 'UNDER_MAINTENANCE', action: 'Mark as under maintenance' },
  { from: 'OUT_OF_SERVICE', to: 'UNDER_MAINTENANCE', action: 'Send damaged for maintenance' },
  { from: 'OUT_OF_SERVICE', to: 'OPERATIONAL', action: 'Repair damaged' },
  { from: 'UNDER_MAINTENANCE', to: 'OPERATIONAL', action: 'Return from maintenance' },
];

const WORDS: Record<EquipmentStatus, string> = {
  OPERATIONAL: 'working',
  OUT_OF_SERVICE: 'damaged',
  UNDER_MAINTENANCE: 'under maintenance',
};

function unitsIn(condition: EquipmentCondition, status: EquipmentStatus): number {
  if (status === 'OUT_OF_SERVICE') return condition.damagedQuantity;
  if (status === 'UNDER_MAINTENANCE') return condition.maintenanceQuantity;
  return condition.workingQuantity;
}

/** Only taking working units out of use can leave reservations short (AC-5). */
const takesOutOfUse = (move: Move) => move.from === 'OPERATIONAL';

function ShortList({
  reservations,
  shortOf,
}: {
  reservations: UpcomingReservation[];
  shortOf: (r: UpcomingReservation) => number;
}) {
  return (
    <ul className="mt-2 divide-y divide-amber-200 text-sm">
      {reservations.map((r) => (
        <li key={r.id} className="py-2">
          <p className="font-medium text-amber-950">{r.event.name ?? 'Untitled event'}</p>
          <p className="text-amber-900">
            {r.quantity} reserved · short by {shortOf(r)} · {formatDateRange(r.start, r.end)}
            {r.event.coordinator ? ` · Coordinator: ${r.event.coordinator.name}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * US-45 — Technical Support move a quantity of an item's units between
 * Available, Damaged and Under Maintenance, from its catalogue entry.
 *
 * AC-1: mark a quantity damaged or under maintenance; AC-3: set a quantity
 * back to available. AC-2: nothing is saved without a reason. AC-5: before
 * saving, the upcoming reservations the change would leave short are listed
 * (event, quantity reserved, how many short); none is cancelled. After saving,
 * the server's own list, taken under its lock, is shown. Over-marking and
 * over-repairing are refused by the server with a message, shown here.
 */
export function EquipmentStatusPanel({
  item,
  condition,
}: {
  item: Equipment;
  condition: EquipmentCondition;
}) {
  const [move, setMove] = useState<Move | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<{ move: Move; quantity: number; affected: UpcomingReservation[] } | null>(
    null,
  );

  const change = useChangeEquipmentStatus(item.id);
  const count = Number(quantity);
  const validCount = Number.isInteger(count) && count >= 1;
  const proposal =
    move && takesOutOfUse(move) && validCount ? { from: move.from, to: move.to, quantity: count } : undefined;
  const preview = useUpcomingReservations(item.id, proposal, proposal !== undefined);
  const affected = (preview.data ?? []).filter((r) => r.shortByAfter > r.shortBy);

  const reset = () => {
    setMove(null);
    setQuantity('1');
    setReason('');
    change.reset();
  };

  function submit() {
    if (!move || !validCount) return;
    change.mutate(
      { from: move.from, to: move.to, quantity: count, reason: reason.trim() },
      {
        onSuccess: (result) => {
          setSaved({ move, quantity: count, affected: result.affectedReservations });
          reset();
        },
      },
    );
  }

  const offered = MOVES.filter((m) => unitsIn(condition, m.from) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-700" aria-label="Units by condition">
          {conditionText(condition)}
          <span className="text-ink-500"> · {condition.totalQuantity} in total</span>
        </p>

        {saved ? (
          <div
            role="status"
            className={
              saved.affected.length > 0
                ? 'rounded-lg border border-amber-300 bg-amber-50 px-4 py-3'
                : 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3'
            }
          >
            <p
              className={
                saved.affected.length > 0
                  ? 'text-sm font-medium text-amber-950'
                  : 'text-sm font-medium text-emerald-900'
              }
            >
              {saved.quantity} unit{saved.quantity === 1 ? '' : 's'} moved from {WORDS[saved.move.from]} to{' '}
              {WORDS[saved.move.to]}.
              {saved.affected.length > 0
                ? ` ${saved.affected.length} upcoming reservation${
                    saved.affected.length === 1 ? ' is' : 's are'
                  } now short. Nothing was cancelled; their Coordinators have been told:`
                : ''}
            </p>
            {saved.affected.length > 0 ? (
              <ShortList reservations={saved.affected} shortOf={(r) => r.shortBy} />
            ) : null}
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" variant="secondary" onClick={() => setSaved(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Change status">
          {offered.map((m) => {
            const chosen = move?.from === m.from && move?.to === m.to;
            return (
              <Button
                key={`${m.from}-${m.to}`}
                type="button"
                size="sm"
                role="radio"
                aria-checked={chosen}
                variant={chosen ? (takesOutOfUse(m) ? 'danger' : 'primary') : 'secondary'}
                onClick={() => {
                  setMove(m);
                  setSaved(null);
                  change.reset();
                }}
              >
                {m.action}
              </Button>
            );
          })}
        </div>

        {move ? (
          <>
            <Field
              label="Quantity"
              htmlFor="equipment-status-quantity"
              required
              hint={`${unitsIn(condition, move.from)} ${WORDS[move.from]} now.`}
            >
              <Input
                id="equipment-status-quantity"
                type="number"
                min={1}
                step={1}
                className="w-32"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            {proposal ? (
              <div aria-live="polite">
                {preview.isPending ? (
                  <p className="text-sm text-ink-500">Checking for affected reservations…</p>
                ) : preview.isError ? (
                  <p className="text-sm text-red-700">
                    {apiErrorMessage(preview.error, 'Could not check for affected reservations.')}
                  </p>
                ) : affected.length > 0 ? (
                  <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-950">
                      Warning: the remaining units can't cover {affected.length} upcoming reservation
                      {affected.length === 1 ? '' : 's'}. They are not cancelled or reassigned.
                    </p>
                    <ShortList reservations={affected} shortOf={(r) => r.shortByAfter} />
                  </div>
                ) : (
                  <p className="text-sm text-ink-600">
                    The remaining units still cover every upcoming reservation.
                  </p>
                )}
              </div>
            ) : null}

            <Field
              label="Reason"
              htmlFor="equipment-status-reason"
              required
              hint={
                takesOutOfUse(move)
                  ? 'What is wrong with them, e.g. "Cracked lens" or "Annual service".'
                  : 'e.g. "Repaired and tested".'
              }
            >
              <Textarea
                id="equipment-status-reason"
                rows={3}
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>

            {change.error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                {apiErrorMessage(change.error, 'Could not change the status.')}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={reset}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant={takesOutOfUse(move) ? 'danger' : 'primary'}
                disabled={
                  change.isPending ||
                  !validCount ||
                  reason.trim().length === 0 ||
                  (proposal !== undefined && preview.isPending)
                }
                onClick={submit}
              >
                {change.isPending ? 'Saving…' : move.action}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
