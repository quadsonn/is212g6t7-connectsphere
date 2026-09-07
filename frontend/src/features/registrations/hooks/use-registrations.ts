import { useQuery } from '@tanstack/react-query';

import type { RegistrationSummary } from '@/types/api';
import { registrationsApi } from '../api/registrations.api';

export const registrationKeys = { mine: ['registrations', 'mine'] as const };

export function useMyRegistrations() {
  return useQuery<RegistrationSummary[]>({
    queryKey: registrationKeys.mine,
    queryFn: registrationsApi.listMine,
  });
}
