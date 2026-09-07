import { useQuery } from '@tanstack/react-query';

import type { Equipment, EquipmentReservationSummary } from '@/types/api';
import { equipmentApi } from '../api/equipment.api';

export const equipmentKeys = {
  requests: ['equipment', 'requests'] as const,
  inventory: ['equipment', 'inventory'] as const,
};

export function useEquipmentRequests() {
  return useQuery<EquipmentReservationSummary[]>({
    queryKey: equipmentKeys.requests,
    queryFn: equipmentApi.listRequests,
  });
}

export function useEquipmentInventory() {
  return useQuery<Equipment[]>({
    queryKey: equipmentKeys.inventory,
    queryFn: equipmentApi.listInventory,
  });
}
