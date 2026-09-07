import type { Equipment, EquipmentReservationSummary } from '@/types/api';

/**
 * MOCK — no equipment endpoints exist yet (E6).
 *
 * TODO(E6): replace both functions with real calls, e.g.
 *   listRequests: () => apiClient.get<...>('/equipment/reservations')...
 *   listInventory: () => apiClient.get<Equipment[]>('/equipment')...
 *
 * NOTE: EquipmentReservationSummary flattens the event name onto the
 * reservation. The backend has no such response shape today — whether the API
 * returns it joined or the client fetches events separately is an open
 * question for the E6 story.
 */
const SAMPLE_REQUESTS: EquipmentReservationSummary[] = [
  {
    id: 'res-1',
    eventId: 'event-1',
    eventName: 'Freshman Orientation 2026',
    equipmentType: 'Wireless microphone',
    quantity: 6,
    start: '2026-10-01T08:00:00.000Z',
    end: '2026-10-01T18:00:00.000Z',
    status: 'REQUESTED',
  },
  {
    id: 'res-2',
    eventId: 'event-2',
    eventName: 'Industry Networking Night',
    equipmentType: 'Portable PA system',
    quantity: 2,
    start: '2026-10-14T10:00:00.000Z',
    end: '2026-10-14T22:00:00.000Z',
    status: 'REQUESTED',
  },
  {
    id: 'res-3',
    eventId: 'event-3',
    eventName: 'Capstone Showcase',
    equipmentType: 'Projector (4K)',
    quantity: 4,
    start: '2026-11-02T09:00:00.000Z',
    end: '2026-11-02T17:00:00.000Z',
    status: 'APPROVED',
  },
];

const SAMPLE_INVENTORY: Equipment[] = [
  { id: 'eq-1', type: 'Wireless microphone', totalQuantity: 24, technicalSpecs: 'UHF, 4h battery' },
  { id: 'eq-2', type: 'Portable PA system', totalQuantity: 6, technicalSpecs: '400W, 2 speakers' },
  { id: 'eq-3', type: 'Projector (4K)', totalQuantity: 8, technicalSpecs: '4000 lumens, HDMI/USB-C' },
];

const LATENCY_MS = 300;

export const equipmentApi = {
  listRequests: async (): Promise<EquipmentReservationSummary[]> => {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return SAMPLE_REQUESTS;
  },
  listInventory: async (): Promise<Equipment[]> => {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return SAMPLE_INVENTORY;
  },
};

export const EQUIPMENT_ENDPOINT_READY = false;
