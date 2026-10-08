import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { eventKeys } from '@/features/events/hooks/use-events';
import type { MyRegistrations, RegisterPayload, RegistrationView } from '@/types/api';
import { registrationsApi } from '../api/registrations.api';

export const registrationKeys = { mine: ['registrations', 'mine'] as const };

/** US-35 — the caller's registrations, current event details included. */
export function useMyRegistrations() {
  return useQuery<MyRegistrations>({
    queryKey: registrationKeys.mine,
    queryFn: registrationsApi.listMine,
  });
}

/**
 * Both register and withdraw change what the Browse list offers (a registered
 * event leaves it; a withdrawn one may return), so each refreshes both lists.
 */
function useRefreshAfterChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: registrationKeys.mine }),
      queryClient.invalidateQueries({ queryKey: eventKeys.all }),
    ]);
}

/** US-34 — register for an event. */
export function useRegister() {
  const refresh = useRefreshAfterChange();
  return useMutation<RegistrationView, unknown, RegisterPayload>({
    mutationFn: registrationsApi.register,
    onSuccess: () => refresh(),
  });
}

/** US-36 — withdraw a registration. */
export function useWithdraw() {
  const refresh = useRefreshAfterChange();
  return useMutation<RegistrationView, unknown, string>({
    mutationFn: registrationsApi.withdraw,
    onSuccess: () => refresh(),
  });
}
