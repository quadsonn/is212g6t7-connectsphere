import { apiClient } from '@/lib/api-client';
import type {
  SafetyDecisionPayload,
  SafetyDecisionResult,
  SafetyQueueEntry,
  SafetyReview,
  SafetyReviewPacket,
} from '@/types/api';

/** REAL — the operational safety check endpoints (/safety). */
export const safetyApi = {
  /** Events awaiting a check, longest-waiting first. */
  queue: () => apiClient.get<SafetyQueueEntry[]>('/safety/queue').then((r) => r.data),

  /** Everything needed to decide on one queued event. */
  packet: (eventId: string) =>
    apiClient.get<SafetyReviewPacket>(`/safety/events/${eventId}`).then((r) => r.data),

  /** Approve, reject or request changes. */
  decide: (eventId: string, payload: SafetyDecisionPayload) =>
    apiClient
      .post<SafetyDecisionResult>(`/safety/events/${eventId}/decision`, payload)
      .then((r) => r.data),

  /** The Coordinator answers the feedback: changes made, check it again. */
  resubmit: (eventId: string, comment?: string) =>
    apiClient
      .post<{ eventStatus: string }>(
        `/safety/events/${eventId}/resubmit`,
        comment?.trim() ? { comment } : {},
      )
      .then((r) => r.data),

  /** Every earlier check of an event, oldest first. */
  reviews: (eventId: string) =>
    apiClient.get<SafetyReview[]>(`/safety/events/${eventId}/reviews`).then((r) => r.data),
};
