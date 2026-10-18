import { apiClient } from '@/lib/api-client';
import type {
  AssignmentResult,
  ContactSummary,
  CoordinatorAssignments,
  QueueEntry,
  QueuedRequestDetail,
} from '@/types/api';

/** REAL — the Event Coordinator Lead endpoints (/assignments). */
export const assignmentsApi = {
  /** The unassigned queue, oldest submission first. */
  queue: () => apiClient.get<QueueEntry[]>('/assignments/queue').then((r) => r.data),

  /** One queued request, opened for review before assigning. */
  queuedRequest: (id: string) =>
    apiClient.get<QueuedRequestDetail>(`/assignments/queue/${id}`).then((r) => r.data),

  /** The Coordinators a request can be assigned or reassigned to. */
  coordinators: () =>
    apiClient.get<ContactSummary[]>('/assignments/coordinators').then((r) => r.data),

  /** Assign a queued request. 409 names the current assignee if taken. */
  assign: (id: string, coordinatorId: string) =>
    apiClient
      .post<AssignmentResult>(`/assignments/queue/${id}/assign`, { coordinatorId })
      .then((r) => r.data),

  /** Every Coordinator with their active events; optionally just one. */
  overview: (coordinatorId?: string) =>
    apiClient
      .get<CoordinatorAssignments[]>('/assignments', {
        params: coordinatorId ? { coordinatorId } : {},
      })
      .then((r) => r.data),

  /** Move an active event to a different Coordinator. */
  reassign: (id: string, coordinatorId: string) =>
    apiClient
      .post<AssignmentResult>(`/assignments/events/${id}/reassign`, { coordinatorId })
      .then((r) => r.data),
};
