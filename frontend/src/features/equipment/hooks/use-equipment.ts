import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AlternativeItem,
  BrowseEquipmentQuery,
  ChangeEquipmentStatusPayload,
  CommitReservationPayload,
  CommittedReservation,
  Equipment,
  EquipmentCondition,
  EquipmentListItem,
  EquipmentStatusChangeResult,
  EquipmentStatusHistoryEntry,
  EventReservationShortage,
  EventRequirementDetails,
  EventRequirements,
  ItemAvailability,
  ReleasedReservation,
  TechnicalSupportAssignment,
  UpcomingReservation,
} from '@/types/api';
import { equipmentApi, type ProposedStatusMove } from '../api/equipment.api';

export const equipmentKeys = {
  all: ['equipment'] as const,
  catalogue: (query: BrowseEquipmentQuery) => ['equipment', 'catalogue', query] as const,
  detail: (id: string) => ['equipment', 'detail', id] as const,
  upcoming: (id: string, proposal?: ProposedStatusMove) =>
    ['equipment', 'detail', id, 'upcoming-reservations', proposal ?? null] as const,
  conditions: ['equipment', 'condition'] as const,
  condition: (id: string) => ['equipment', 'detail', id, 'condition'] as const,
  history: (id: string) => ['equipment', 'detail', id, 'status-history'] as const,
  eventReservations: (eventId: string) => ['equipment', 'events', eventId, 'reservations'] as const,
  alternatives: (reservationId: string, quantity: number) =>
    ['equipment', 'reservations', reservationId, 'alternatives', quantity] as const,
  requirements: ['equipment', 'requirements'] as const,
  eventRequirements: (eventId: string) => ['equipment', 'requirements', eventId] as const,
  eventDetails: (eventId: string) => ['equipment', 'requirements', eventId, 'details'] as const,
  released: ['equipment', 'released'] as const,
  assignments: ['equipment', 'assignments'] as const,
};

/** US-29 — the catalogue, optionally searched and sorted server-side. */
export function useEquipmentCatalogue(query: BrowseEquipmentQuery = {}) {
  return useQuery<EquipmentListItem[]>({
    queryKey: equipmentKeys.catalogue(query),
    queryFn: () => equipmentApi.listCatalogue(query),
    staleTime: 0,
  });
}

/** US-29 AC-2 — one item's full detail. */
export function useEquipmentItem(id: string) {
  return useQuery<Equipment>({
    queryKey: equipmentKeys.detail(id),
    queryFn: () => equipmentApi.getById(id),
    enabled: Boolean(id),
  });
}

/**
 * US-45 AC-5 — the item's committed reservations that have not ended, each
 * with how many units it is short by now and under `proposal` (the warning
 * shown before a change is saved).
 */
export function useUpcomingReservations(id: string, proposal?: ProposedStatusMove, enabled = true) {
  return useQuery<UpcomingReservation[]>({
    queryKey: equipmentKeys.upcoming(id, proposal),
    queryFn: () => equipmentApi.listUpcomingReservations(id, proposal),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
  });
}

/** US-45 — every item's units by condition, for the catalogue. */
export function useEquipmentConditions() {
  return useQuery<EquipmentCondition[]>({
    queryKey: equipmentKeys.conditions,
    queryFn: equipmentApi.listConditions,
    staleTime: 0,
  });
}

/** US-45 — one item's units by condition. */
export function useEquipmentCondition(id: string) {
  return useQuery<EquipmentCondition>({
    queryKey: equipmentKeys.condition(id),
    queryFn: () => equipmentApi.getCondition(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** US-45 AC-2 — the item's status history, with quantities. */
export function useEquipmentStatusHistory(id: string) {
  return useQuery<EquipmentStatusHistoryEntry[]>({
    queryKey: equipmentKeys.history(id),
    queryFn: () => equipmentApi.listStatusHistory(id),
    enabled: Boolean(id),
  });
}

/** US-45 — an event's upcoming reservations with their shortage. */
export function useEventReservations(eventId: string) {
  return useQuery<EventReservationShortage[]>({
    queryKey: equipmentKeys.eventReservations(eventId),
    queryFn: () => equipmentApi.listEventReservations(eventId),
    enabled: Boolean(eventId),
    staleTime: 0,
  });
}

/** US-45 — items free in `quantity` for a short reservation's period. */
export function useAlternatives(reservationId: string, quantity: number, enabled: boolean) {
  return useQuery<AlternativeItem[]>({
    queryKey: equipmentKeys.alternatives(reservationId, quantity),
    queryFn: () => equipmentApi.listAlternatives(reservationId, quantity),
    enabled: enabled && quantity > 0,
    staleTime: 0,
  });
}

/**
 * US-45 — reduce, release, suggest, accept or decline. Each one changes
 * availability and the event pages, so every equipment and event query is
 * refreshed.
 */
function useShortageMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, TVars>({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: equipmentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
      ]),
  });
}

export const useReduceReservation = () =>
  useShortageMutation((v: { id: string; quantity: number; reason: string }) =>
    equipmentApi.reduceReservation(v.id, { quantity: v.quantity, reason: v.reason }),
  );

export const useReleaseReservation = () =>
  useShortageMutation((v: { id: string; reason: string }) =>
    equipmentApi.releaseReservation(v.id, { reason: v.reason }),
  );

export const useSuggestAlternative = () =>
  useShortageMutation(
    (v: { id: string; alternativeEquipmentId: string; quantity: number; reason: string }) =>
      equipmentApi.suggestAlternative(v.id, {
        alternativeEquipmentId: v.alternativeEquipmentId,
        quantity: v.quantity,
        reason: v.reason,
      }),
  );

export const useRecordNoAlternative = () =>
  useShortageMutation((v: { id: string; reason: string }) =>
    equipmentApi.recordNoAlternative(v.id, { reason: v.reason }),
  );

export const useAcceptSuggestion = () =>
  useShortageMutation((id: string) => equipmentApi.acceptSuggestion(id));

export const useDeclineSuggestion = () =>
  useShortageMutation((id: string) => equipmentApi.declineSuggestion(id));

/**
 * US-45 — change an item's status. Invalidates every equipment query: the
 * item's detail, and any availability the status now changes (AC-4).
 */
export function useChangeEquipmentStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation<EquipmentStatusChangeResult, unknown, ChangeEquipmentStatusPayload>({
    mutationFn: (payload) => equipmentApi.changeStatus(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

/**
 * US-30 — run on demand from the form, hence a mutation rather than a query.
 *
 * Checks several equipment types for the same window at once by calling the
 * single-item endpoint once per type, in parallel. Results come back in the
 * order the types were listed.
 */
export function useCheckAvailability() {
  return useMutation<
    ItemAvailability[],
    unknown,
    { start: string; end: string; items: { equipmentId: string; quantity: number }[] }
  >({
    mutationFn: ({ start, end, items }) =>
      Promise.all(
        items.map(({ equipmentId, quantity }) =>
          equipmentApi.checkAvailability(equipmentId, { start, end, quantity }),
        ),
      ),
  });
}

/** US-31 — events with equipment requirements. */
export function useEventRequirementsList(includeFinished = false) {
  return useQuery<EventRequirements[]>({
    // Under the shared key, so invalidating the requirements refreshes both lists.
    queryKey: [...equipmentKeys.requirements, { includeFinished }],
    queryFn: () => equipmentApi.listRequirements(includeFinished),
    staleTime: 0,
  });
}

/** US-31 — one event's requirements. */
export function useEventRequirements(eventId: string) {
  return useQuery<EventRequirements>({
    queryKey: equipmentKeys.eventRequirements(eventId),
    queryFn: () => equipmentApi.getRequirements(eventId),
    enabled: Boolean(eventId),
    staleTime: 0,
  });
}

/** US-31 — "View more details": the full event. */
export function useEventRequirementDetails(eventId: string) {
  return useQuery<EventRequirementDetails>({
    queryKey: equipmentKeys.eventDetails(eventId),
    queryFn: () => equipmentApi.getRequirementDetails(eventId),
    enabled: Boolean(eventId),
    staleTime: 0,
  });
}

/** US-32 — commit equipment to an event. */
export function useCommitReservation() {
  const queryClient = useQueryClient();
  return useMutation<CommittedReservation, unknown, CommitReservationPayload>({
    mutationFn: equipmentApi.commitReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

/** US-33 AC-3 — released reservations. */
export function useReleasedReservations() {
  return useQuery<ReleasedReservation[]>({
    queryKey: equipmentKeys.released,
    queryFn: equipmentApi.listReleased,
    staleTime: 0,
  });
}

/** US-61 AC-3 — the events the caller is assigned to support. */
export function useMyTechnicalSupportAssignments() {
  return useQuery<TechnicalSupportAssignment[]>({
    queryKey: equipmentKeys.assignments,
    queryFn: equipmentApi.listMyAssignments,
    staleTime: 0,
  });
}
