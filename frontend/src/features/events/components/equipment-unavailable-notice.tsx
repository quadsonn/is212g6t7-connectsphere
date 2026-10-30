import { AlertTriangle } from 'lucide-react';

import { EQUIPMENT_STATUS_STYLES } from '@/lib/status';
import type { UnavailableEquipment } from '@/types/api';

/**
 * Indicator only — no actions. Warns that equipment the event requested or
 * reserved has been taken out of service, so the arrangements need attention.
 * The server derives this live from each item's current status, so it appears
 * and clears on its own; this component only surfaces it. It renders nothing
 * when all equipment is available.
 */
export function EquipmentUnavailableNotice({
  items,
}: {
  items: UnavailableEquipment[] | undefined;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <div>
            <p className="font-semibold text-amber-900">Equipment needs attention</p>
            <p className="text-amber-800">
              Equipment this event requested or reserved is no longer available. The
              arrangements will need to be revisited.
            </p>
          </div>
          <ul className="space-y-1 text-amber-900">
            {items.map((item) => (
              <li key={item.reservationId} className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-medium">
                  {item.quantity} × {item.equipmentType}
                </span>
                <span className="text-amber-700">
                  — {EQUIPMENT_STATUS_STYLES[item.equipmentStatus].label.toLowerCase()}
                  {item.reservationStatus === 'REQUESTED' ? ' · requested' : ' · reserved'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
