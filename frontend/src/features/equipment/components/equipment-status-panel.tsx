import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { apiErrorMessage } from '@/lib/api-client';
import { EQUIPMENT_STATUS_STYLES } from '@/lib/status';
import { formatDate, formatDateRange } from '@/lib/utils';
import type { Equipment, EquipmentStatus, UpcomingReservation } from '@/types/api';
import { useChangeEquipmentStatus, useUpcomingReservations } from '../hooks/use-equipment';

/** The order the options are offered in, and the verb for each. */
const OPTIONS: { status: EquipmentStatus; action: string }[] = [
  { status: 'OUT_OF_SERVICE', action: 'Mark as damaged' },
  { status: 'UNDER_MAINTENANCE', action: 'Mark as under maintenance' },
  { status: 'OPERATIONAL', action: 'Set back to available' },
];

/** Only taking an item out of use affects its reservations (AC-5). */
const takesOutOfUse = (status: EquipmentStatus) => status !== 'OPERATIONAL';

function ReservationList({ reservations }: { reservations: UpcomingReservation[] }) {
  return (
    <ul className="mt-2 divide-y divide-amber-200 text-sm">
      {reservations.map((r) => (
        <li key={r.id} className="py-2">
          <p className="font-medium text-amber-950">{r.event.name ?? 'Untitled event'}</p>
          <p className="text-amber-900">
            {r.quantity} unit{r.quantity === 1 ? '' : 's'} · {formatDateRange(r.start, r.end)} ·{' '}
            {r.status === 'APPROVED' ? 'Committed' : 'Requested'}
            {r.event.coordinator ? ` · Coordinator: ${r.event.coordinator.name}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * US-45 — Technical Support changes an item's status from its catalogue entry.
 *
 * AC-1: Damaged or Under Maintenance. AC-2: the change cannot be saved
 * without a reason. AC-3: back to Available once repaired. AC-5: before
 * saving, the reservations the change would affect are listed as a warning;
 * after saving, the server's own list (taken under its lock) is shown, since
 * a reservation may have been made in between. AC-4 is enforced server-side.
 */
export function EquipmentStatusPanel({ item }: { item: Equipment }) {
  const [choice, setChoice] = useState<EquipmentStatus | null>(null);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<{
    status: EquipmentStatus;
    affected: UpcomingReservation[];
  } | null>(null);

  const change = useChangeEquipmentStatus(item.id);
  const warningWanted = choice !== null && takesOutOfUse(choice);
  const upcoming = useUpcomingReservations(item.id, warningWanted);

  const reset = () => {
    setChoice(null);
    setReason('');
    change.reset();
  };

  function submit() {
    if (!choice) return;
    change.mutate(
      { status: choice, reason: reason.trim() },
      {
        onSuccess: (result) => {
          setSaved({ status: choice, affected: result.affectedReservations });
          reset();
        },
      },
    );
  }

  const latest = item.latestStatusChange;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {latest && latest.toStatus === item.operationalStatus ? (
          <div className="text-sm text-ink-700">
            <p>
              <span className="font-medium text-ink-900">Reason:</span> {latest.reason}
            </p>
            <p className="text-xs text-ink-500">
              Set to {EQUIPMENT_STATUS_STYLES[latest.toStatus].label.toLowerCase()} by{' '}
              {latest.changedBy.name} on {formatDate(latest.changedAt)}
            </p>
          </div>
        ) : null}

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
              Status changed to {EQUIPMENT_STATUS_STYLES[saved.status].label.toLowerCase()}.
              {saved.affected.length > 0
                ? ` ${saved.affected.length} existing reservation${
                    saved.affected.length === 1 ? ' is' : 's are'
                  } affected and still hold this item — arrange a replacement or let the coordinator know:`
                : ''}
            </p>
            {saved.affected.length > 0 ? <ReservationList reservations={saved.affected} /> : null}
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" variant="secondary" onClick={() => setSaved(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Change status">
          {OPTIONS.filter((option) => option.status !== item.operationalStatus).map((option) => (
            <Button
              key={option.status}
              type="button"
              size="sm"
              role="radio"
              aria-checked={choice === option.status}
              variant={
                choice === option.status
                  ? takesOutOfUse(option.status)
                    ? 'danger'
                    : 'primary'
                  : 'secondary'
              }
              onClick={() => {
                setChoice(option.status);
                setSaved(null);
                change.reset();
              }}
            >
              {option.action}
            </Button>
          ))}
        </div>

        {choice ? (
          <>
            {warningWanted ? (
              <div aria-live="polite">
                {upcoming.isPending ? (
                  <p className="text-sm text-ink-500">Checking for affected reservations…</p>
                ) : upcoming.isError ? (
                  <p className="text-sm text-red-700">
                    {apiErrorMessage(upcoming.error, 'Could not check for affected reservations.')}
                  </p>
                ) : upcoming.data.length > 0 ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-amber-950">
                      Warning: {upcoming.data.length} existing reservation
                      {upcoming.data.length === 1 ? '' : 's'} will be affected. They are not
                      cancelled automatically.
                    </p>
                    <ReservationList reservations={upcoming.data} />
                  </div>
                ) : (
                  <p className="text-sm text-ink-600">
                    No upcoming reservations of this item are affected.
                  </p>
                )}
              </div>
            ) : null}

            <Field
              label="Reason"
              htmlFor="equipment-status-reason"
              required
              hint={
                takesOutOfUse(choice)
                  ? 'What is wrong with it, e.g. "Cracked casing" or "Annual service".'
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
                variant={takesOutOfUse(choice) ? 'danger' : 'primary'}
                disabled={
                  change.isPending ||
                  reason.trim().length === 0 ||
                  (warningWanted && upcoming.isPending)
                }
                onClick={submit}
              >
                {change.isPending
                  ? 'Saving…'
                  : `Change to ${EQUIPMENT_STATUS_STYLES[choice].label.toLowerCase()}`}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
