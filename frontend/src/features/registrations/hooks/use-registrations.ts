import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { eventKeys } from '@/features/events/hooks/use-events';
import type {
  MyRegistrations,
  RegisterPayload,
  RegistrationOptionsView,
  RegistrationView,
} from '@/types/api';
import { registrationsApi } from '../api/registrations.api';

export const registrationKeys = {
  all: ['registrations'] as const,
  mine: ['registrations', 'mine'] as const,
  options: (eventId: string) => ['registrations', 'options', eventId] as const,
};

/**
 * US-34 — whether the Register option applies to one event and, if not, why.
 * Always refetched: the answer depends on the clock and on other people's
 * registrations, so a cached answer would offer a place that has gone.
 */
export function useRegistrationOptions(eventId: string) {
  return useQuery<RegistrationOptionsView>({
    queryKey: registrationKeys.options(eventId),
    queryFn: () => registrationsApi.options(eventId),
    staleTime: 0,
  });
}

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
      // Prefix match: refreshes My registrations and every event's options
      // (a registration changes how full an event is).
      queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
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
