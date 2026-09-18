import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, MockDataNotice, TableSkeleton } from '@/components/ui/states';
import { useEquipmentInventory, useEquipmentRequests } from '@/features/equipment/hooks/use-equipment';
import { EQUIPMENT_ENDPOINT_READY } from '@/features/equipment/api/equipment.api';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';

const REQUEST_BADGE: Record<string, string> = {
  REQUESTED: 'bg-blue-50 text-blue-800 ring-blue-300',
  APPROVED: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  REJECTED: 'bg-red-50 text-red-800 ring-red-300',
};

/** MOCKED — no equipment endpoints exist yet (E6). */
export function EquipmentDashboard() {
  const requests = useEquipmentRequests();
  const inventory = useEquipmentInventory();

  return (
    <>
      <PageHeader
        title="Equipment requests"
        description="Reservations awaiting technical review, and what is on the shelf."
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {!EQUIPMENT_ENDPOINT_READY ? (
            <MockDataNotice endpoint="GET /equipment/reservations" />
          ) : null}

          <CardHeader>
            <CardTitle>Requests</CardTitle>
            {requests.data ? (
              <span className="text-sm text-ink-500">{requests.data.length} total</span>
            ) : null}
          </CardHeader>

          {requests.isPending ? <TableSkeleton rows={3} /> : null}

          {requests.isError ? (
            <CardContent>
              <ErrorState message={apiErrorMessage(requests.error, 'Could not load requests.')} />
            </CardContent>
          ) : null}

          {requests.data && requests.data.length === 0 ? (
            <EmptyState title="No requests" description="Equipment requests appear here for review." />
          ) : null}

          {requests.data && requests.data.length > 0 ? (
            <ul className="divide-y divide-ink-100">
              {requests.data.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-medium text-ink-900">
                        {request.quantity} × {request.equipmentType}
                      </span>
                      <Badge className={REQUEST_BADGE[request.status]} srPrefix="Status">
                        {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {request.eventName} · {formatDateRange(request.start, request.end)}
                    </p>
                  </div>

                  {/* Placeholder — reviewing a request is E6. */}
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" disabled title="Not built yet">
                      Check availability
                    </Button>
                    <Button size="sm" disabled title="Not built yet">
                      Reserve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          {!EQUIPMENT_ENDPOINT_READY ? <MockDataNotice endpoint="GET /equipment" /> : null}

          <CardHeader>
            <CardTitle>Inventory</CardTitle>
          </CardHeader>

          {inventory.isPending ? <TableSkeleton rows={3} /> : null}

          {inventory.data ? (
            <ul className="divide-y divide-ink-100">
              {inventory.data.map((item) => (
                <li key={item.id} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink-900">{item.type}</span>
                    <span className="text-sm tabular-nums text-ink-600">{item.totalQuantity}</span>
                  </div>
                  {item.technicalSpecs ? (
                    <p className="mt-0.5 text-xs text-ink-500">{item.technicalSpecs}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </>
  );
}
