import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import { EQUIPMENT_STATUS_STYLES } from '@/lib/status';
import { formatDate, formatDateRange } from '@/lib/utils';
import type { EventStatus } from '@/types/api';
import {
  useEquipmentStatusHistory,
  useEventReservations,
  useUpcomingReservations,
} from '../hooks/use-equipment';
import { ShortBadge } from './equipment-condition';
import { ReservationActions } from './reservation-actions';

/**
 * US-45 — an item's upcoming committed reservations, each flagged "Short by N"
 * while the working units can't cover it, with Technical Support's actions.
 */
export function ItemReservationsCard({ equipmentId }: { equipmentId: string }) {
  const { data, isPending, isError, error } = useUpcomingReservations(equipmentId);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Upcoming reservations</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? <p className="text-sm text-ink-500">Loading reservations…</p> : null}
        {isError ? <ErrorState message={apiErrorMessage(error, 'Could not load reservations.')} /> : null}
        {data && data.length === 0 ? (
          <p className="text-sm text-ink-600">No upcoming reservations of this item.</p>
        ) : null}
        {data && data.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {data.map((r) => (
              <li key={r.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{r.event.name ?? 'Untitled event'}</span>
                  <ShortBadge shortBy={r.shortBy} />
                </div>
                <p className="text-sm text-ink-600">
                  {r.quantity} reserved · {formatDateRange(r.start, r.end)}
                  {r.event.coordinator ? ` · Coordinator: ${r.event.coordinator.name}` : ''}
                </p>
                {r.shortBy > 0 ? (
                  <ReservationActions
                    reservationId={r.id}
                    quantity={r.quantity}
                    shortBy={r.shortBy}
                    canSuggest={r.event.status === 'CONFIRMED'}
                    openSuggestion={r.openSuggestion}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** US-45 AC-2 — the item's status history: quantity, status, reason, who and when. */
export function StatusHistoryCard({ equipmentId }: { equipmentId: string }) {
  const { data, isPending, isError, error } = useEquipmentStatusHistory(equipmentId);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Status history</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? <p className="text-sm text-ink-500">Loading history…</p> : null}
        {isError ? <ErrorState message={apiErrorMessage(error, 'Could not load the history.')} /> : null}
        {data && data.length === 0 ? (
          <p className="text-sm text-ink-600">No status changes recorded.</p>
        ) : null}
        {data && data.length > 0 ? (
          <ul className="divide-y divide-ink-100 text-sm">
            {data.map((entry) => (
              <li key={entry.id} className="py-2">
                <p className="text-ink-900">
                  {entry.quantity} unit{entry.quantity === 1 ? '' : 's'}:{' '}
                  {EQUIPMENT_STATUS_STYLES[entry.fromStatus].label.toLowerCase()} →{' '}
                  {EQUIPMENT_STATUS_STYLES[entry.toStatus].label.toLowerCase()}
                </p>
                <p className="text-ink-700">Reason: {entry.reason}</p>
                <p className="text-xs text-ink-500">
                  {entry.changedBy.name} · {formatDate(entry.changedAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * US-45 — Technical Support's view of an event's reservations, each flagged
 * "Short by N" while the working units can't cover it, with the actions.
 */
export function EventReservationsCard({
  eventId,
  eventStatus,
}: {
  eventId: string;
  eventStatus: EventStatus;
}) {
  const { data, isPending, isError, error } = useEventReservations(eventId);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Reserved for this event</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? <p className="text-sm text-ink-500">Loading reservations…</p> : null}
        {isError ? <ErrorState message={apiErrorMessage(error, 'Could not load reservations.')} /> : null}
        {data && data.length === 0 ? (
          <p className="text-sm text-ink-600">Nothing is reserved for this event yet.</p>
        ) : null}
        {data && data.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {data.map((r) => (
              <li key={r.reservationId} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">
                    {r.quantity} × {r.equipmentType}
                  </span>
                  <ShortBadge shortBy={r.shortBy} />
                </div>
                <p className="text-sm text-ink-600">{formatDateRange(r.start, r.end)}</p>
                {r.shortBy > 0 ? (
                  <ReservationActions
                    reservationId={r.reservationId}
                    quantity={r.quantity}
                    shortBy={r.shortBy}
                    canSuggest={eventStatus === 'CONFIRMED'}
                    openSuggestion={r.openSuggestion}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
