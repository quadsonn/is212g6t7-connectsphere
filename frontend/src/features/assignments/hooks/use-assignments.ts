import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { assignmentsApi } from '../api/assignments.api';

export const assignmentKeys = {
  all: ['assignments'] as const,
  queue: ['assignments', 'queue'] as const,
  queued: (id: string) => ['assignments', 'queue', id] as const,
  coordinators: ['assignments', 'coordinators'] as const,
  overview: (coordinatorId: string) => ['assignments', 'overview', coordinatorId] as const,
};

export function useQueue() {
  return useQuery({ queryKey: assignmentKeys.queue, queryFn: assignmentsApi.queue });
}

export function useQueuedRequest(id: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.queued(id ?? ''),
    queryFn: () => assignmentsApi.queuedRequest(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAssignableCoordinators() {
  return useQuery({
    queryKey: assignmentKeys.coordinators,
    queryFn: assignmentsApi.coordinators,
  });
}

/** `coordinatorId` of '' means every Coordinator. */
export function useAssignmentsOverview(coordinatorId: string) {
  return useQuery({
    queryKey: assignmentKeys.overview(coordinatorId),
    queryFn: () => assignmentsApi.overview(coordinatorId || undefined),
  });
}

/** Assigning moves a request out of the queue and into a Coordinator's list. */
export function useAssignRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, coordinatorId }: { id: string; coordinatorId: string }) =>
      assignmentsApi.assign(id, coordinatorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useReassignEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, coordinatorId }: { id: string; coordinatorId: string }) =>
      assignmentsApi.reassign(id, coordinatorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}
