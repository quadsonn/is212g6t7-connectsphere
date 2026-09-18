import type { RegistrationSummary } from '@/types/api';

/**
 * MOCK — no registration endpoints exist yet (E7).
 *
 * TODO(E7): replace with real calls once the story lands:
 *   listMine: () => apiClient.get<...>('/registrations')...
 *   register: (eventId) => apiClient.post(`/events/${eventId}/registrations`)...
 *   withdraw: (eventId) => apiClient.delete(...)
 *
 * The register/withdraw buttons on the Attendee dashboard are inert on purpose
 * — wiring them to a mock mutation would imply a persistence guarantee that
 * does not exist.
 */
const SAMPLE: RegistrationSummary[] = [];

const LATENCY_MS = 200;

export const registrationsApi = {
  listMine: async (): Promise<RegistrationSummary[]> => {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return SAMPLE;
  },
};

export const REGISTRATIONS_ENDPOINT_READY = false;
