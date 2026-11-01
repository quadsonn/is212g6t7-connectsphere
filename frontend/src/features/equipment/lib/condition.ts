import type { EquipmentCondition } from '@/types/api';

/** US-45 — "8 available, 2 damaged, 0 under maintenance". */
export function conditionText(condition: EquipmentCondition): string {
  return (
    `${condition.workingQuantity} available, ${condition.damagedQuantity} damaged, ` +
    `${condition.maintenanceQuantity} under maintenance`
  );
}
