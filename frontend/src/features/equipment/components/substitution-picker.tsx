import { Select } from '@/components/ui/form';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type { UpcomingReservation } from '@/types/api';
import { useAlternatives } from '../hooks/use-equipment';

/** What the dropdown holds when nothing has been chosen yet. */
export const UNANSWERED = '';
/** The escape hatch: nothing in the catalogue fits. The Coordinator can only acknowledge. */
export const NO_ALTERNATIVE = '__none__';

/** Only an event that has reached CONFIRMED needs a replacement offered. */
export const needsReplacement = (reservation: UpcomingReservation) =>
  reservation.event.status === 'CONFIRMED';

/**
 * One reservation on a CONFIRMED event: Technical Support must pick a
 * replacement (same quantity as the reservation) or "No valid alternative"
 * before the item can be taken out of use. The server re-checks the choice
 * under lock, so a stale list cannot over-commit an item.
 */
export function SubstitutionPicker({
  reservation,
  value,
  onChange,
}: {
  reservation: UpcomingReservation;
  value: string;
  onChange: (value: string) => void;
}) {
  const alternatives = useAlternatives(reservation.id);
  const id = `substitution-${reservation.id}`;

  return (
    <li className="py-3">
      <label htmlFor={id} className="block text-sm font-medium text-amber-950">
        {reservation.event.name ?? 'Untitled event'} — {reservation.quantity} unit
        {reservation.quantity === 1 ? '' : 's'}
        <span className="ml-1 font-normal text-amber-900">
          · {formatDateRange(reservation.start, reservation.end)}
        </span>
      </label>
      <p className="mb-1.5 text-xs text-amber-800">
        This event is confirmed. Suggest a replacement with {reservation.quantity} free for the
        same time, or say there is none.
      </p>

      {alternatives.isError ? (
        <p role="alert" className="text-xs text-red-700">
          {apiErrorMessage(alternatives.error, 'Could not load replacements.')}
        </p>
      ) : null}

      <Select
        id={id}
        value={value}
        disabled={alternatives.isPending}
        aria-required="true"
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={UNANSWERED}>
          {alternatives.isPending ? 'Loading replacements…' : 'Choose a replacement…'}
        </option>
        {(alternatives.data ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.type}
            {item.location ? ` (${item.location})` : ''} — {item.availableQuantity} free
            {item.sameType ? ' · same type' : ''}
          </option>
        ))}
        <option value={NO_ALTERNATIVE}>No valid alternative</option>
      </Select>

      {!alternatives.isPending && !alternatives.isError && alternatives.data?.length === 0 ? (
        <p className="mt-1 text-xs text-amber-800">
          Nothing in the catalogue has {reservation.quantity} free for that time. Choose “No valid
          alternative” — the Coordinator will be told and can acknowledge it.
        </p>
      ) : null}
    </li>
  );
}
