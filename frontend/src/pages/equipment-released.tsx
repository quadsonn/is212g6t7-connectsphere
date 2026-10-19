import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useReleasedReservations } from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDate, formatDateRange } from '@/lib/utils';

/**
 * US-33 AC-3 — REAL data, GET /equipment/reservations/released. Which
 * reservations were released, and for which event — cancelled (US-33) or
 * rescheduled (US-38; since US-48 a moved event's reservations are rebooked
 * for the new time before the originals are released here).
 */
export function EquipmentReleased() {
  const { data: released, isPending, isError, error } = useReleasedReservations();

  return (
    <>
      <PageHeader
        title="Released reservations"
        description="Equipment freed up because its event was cancelled or rescheduled."
      />

      <Card>
        <CardHeader>
          <CardTitle>Released</CardTitle>
          {released ? (
            <span className="text-sm text-ink-500">{released.length} total</span>
          ) : null}
        </CardHeader>

        {isPending ? <TableSkeleton rows={3} /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load released reservations.')} />
          </CardContent>
        ) : null}

        {released && released.length === 0 ? (
          <EmptyState
            title="Nothing released"
            description="Reservations are released here automatically when their event is cancelled or its dates change."
          />
        ) : null}

        {released && released.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Equipment reservations released because an event was cancelled or rescheduled
              </caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Event</th>
                  <th scope="col" className="px-5 py-3 font-medium">Equipment</th>
                  <th scope="col" className="px-5 py-3 font-medium">Quantity</th>
                  <th scope="col" className="px-5 py-3 font-medium">Why released</th>
                  <th scope="col" className="px-5 py-3 font-medium">Period</th>
                  <th scope="col" className="px-5 py-3 font-medium">Released</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {released.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3.5 font-medium text-ink-900">
                      {row.event.name ?? 'Untitled event'}
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{row.equipment.type}</td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-600">{row.quantity}</td>
                    <td className="px-5 py-3.5 text-ink-600">
                      {row.event.status === 'CANCELLED'
                        ? 'Event cancelled'
                        : row.event.status === 'REJECTED'
                          ? 'Event rejected' // US-47
                          : row.replacedById
                            ? 'Event moved — rebooked for the new time' // US-48
                            : 'Event rescheduled'}
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{formatDateRange(row.start, row.end)}</td>
                    <td className="px-5 py-3.5 text-ink-600">{formatDate(row.releasedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}
