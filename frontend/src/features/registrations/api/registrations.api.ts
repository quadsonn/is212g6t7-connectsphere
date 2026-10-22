import { apiClient } from '@/lib/api-client';
import type {
  MyRegistrations,
  RegisterPayload,
  RegistrationOptionsView,
  RegistrationView,
} from '@/types/api';

/**
 * REAL — the E7 endpoints (US-34 to US-36). All are Attendee-only; the server
 * re-checks every rule (window, capacity, ownership, cutoff), so the flags it
 * returns only decide what the UI offers.
 */
export const registrationsApi = {
  listMine: () => apiClient.get<MyRegistrations>('/registrations/me').then((r) => r.data),

  /** May I register for this event right now, and if not, why (with the times). */
  options: (eventId: string) =>
    apiClient
      .get<RegistrationOptionsView>(`/registrations/events/${eventId}/options`)
      .then((r) => r.data),

  register: (payload: RegisterPayload) =>
    apiClient.post<RegistrationView>('/registrations', payload).then((r) => r.data),

  /** US-36 AC-2: the body must confirm, so a stray request cannot withdraw. */
  withdraw: (registrationId: string) =>
    apiClient
      .post<RegistrationView>(`/registrations/${registrationId}/withdraw`, { confirm: true })
      .then((r) => r.data),
};
