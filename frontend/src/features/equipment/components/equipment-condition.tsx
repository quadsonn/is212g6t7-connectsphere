import { Badge } from '@/components/ui/badge';
import type { EquipmentCondition } from '@/types/api';
import { conditionText } from '../lib/condition';

/** US-45 — an item's units by condition, as text. */
export function ConditionSummary({ condition }: { condition: EquipmentCondition | undefined }) {
  if (!condition) return <span className="text-ink-400">—</span>;

  const outOfUse = condition.damagedQuantity + condition.maintenanceQuantity > 0;
  return (
    <span className={outOfUse ? 'text-amber-900' : 'text-ink-600'}>{conditionText(condition)}</span>
  );
}

/**
 * US-45 — flags a reservation the working units no longer cover. Derived on
 * the server each time, so it disappears once the reservations fit again.
 */
export function ShortBadge({ shortBy }: { shortBy: number }) {
  if (shortBy <= 0) return null;
  return (
    <Badge className="bg-red-50 text-red-800 ring-red-300" srPrefix="Shortage">
      Short by {shortBy}
    </Badge>
  );
}
