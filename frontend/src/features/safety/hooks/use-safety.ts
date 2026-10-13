import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { eventKeys } from '@/features/events/hooks/use-events';
import type { SafetyDecisionPayload } from '@/types/api';
import { safetyApi } from '../api/safety.api';

export const safetyKeys = {
  all: ['safety'] as const,
  queue: ['safety', 'queue'] as const,
  packet: (eventId: string) => ['safety', 'packet', eventId] as const,
  reviews: (eventId: string) => ['safety', 'reviews', eventId] as const,
};

export function useSafetyQueue() {
  return useQuery({ queryKey: safetyKeys.queue, queryFn: safetyApi.queue });
}

/** Not retried: a 404 means the event is no longer awaiting a check. */
export function useSafetyPacket(eventId: string | undefined) {
  return useQuery({
    queryKey: safetyKeys.packet(eventId ?? ''),
    queryFn: () => safetyApi.packet(eventId!),
    enabled: Boolean(eventId),
    retry: false,
  });
}

/** An event's earlier checks. For a Coordinator this is how the reasons reach them. */
export function useSafetyReviews(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: safetyKeys.reviews(eventId ?? ''),
    queryFn: () => safetyApi.reviews(eventId!),
    enabled: enabled && Boolean(eventId),
  });
}

/** The Coordinator sends the event back to the Safety Officer. */
export function useResubmitSafety(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (comment?: string) => safetyApi.resubmit(eventId, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: safetyKeys.all });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

/** A decision moves the event on, so the queue and every event view are stale. */
export function useDecideSafety(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SafetyDecisionPayload) => safetyApi.decide(eventId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: safetyKeys.all });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}
