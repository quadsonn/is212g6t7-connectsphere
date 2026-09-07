import type { Venue } from '@/types/api';

/**
 * MOCK — GET /venues does not exist yet (E4 / venues story).
 *
 * TODO(E4): delete SAMPLE_VENUES and this file's body, then implement against
 * the real endpoint:
 *
 *   list: () => apiClient.get<Venue[]>('/venues').then((r) => r.data),
 *
 * The exported shape is deliberately identical to what the real client will
 * expose, so only this file changes. Callers and hooks stay untouched.
 */
const SAMPLE_VENUES: Venue[] = [
  {
    id: 'venue-1',
    name: 'Sandbox Auditorium',
    location: 'School of Computing, Level 1',
    capacity: 420,
    facilities: ['Stage', 'PA system', 'Projection'],
    accessibilityFeatures: ['Step-free access', 'Hearing loop'],
    supportedLayouts: ['Theatre', 'Presentation'],
    operatingInfo: 'Mon–Fri, 08:00–22:00',
    status: 'PUBLISHED',
  },
  {
    id: 'venue-2',
    name: 'Seminar Room 3-4',
    location: 'Administration Building, Level 3',
    capacity: 60,
    facilities: ['Whiteboard', 'Video conferencing'],
    accessibilityFeatures: ['Step-free access'],
    supportedLayouts: ['Classroom', 'U-shape', 'Boardroom'],
    operatingInfo: 'Mon–Sat, 09:00–18:00',
    status: 'PUBLISHED',
  },
  {
    id: 'venue-3',
    name: 'Campus Green',
    location: 'Outdoor, adjacent to Library',
    capacity: 800,
    facilities: ['Power supply', 'Marquee points'],
    accessibilityFeatures: ['Step-free access', 'Accessible toilets nearby'],
    supportedLayouts: ['Open', 'Booths'],
    operatingInfo: 'Daily, subject to weather',
    status: 'DRAFT',
  },
  {
    id: 'venue-4',
    name: 'Innovation Lab',
    location: 'Research Wing, Level 2',
    capacity: 35,
    facilities: ['Moveable furniture', 'Smart displays'],
    accessibilityFeatures: ['Step-free access', 'Adjustable-height desks'],
    supportedLayouts: ['Workshop', 'Cabaret'],
    operatingInfo: 'Mon–Fri, 09:00–19:00',
    status: 'DRAFT',
  },
];

const LATENCY_MS = 300;

export const venuesApi = {
  list: async (): Promise<Venue[]> => {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return SAMPLE_VENUES;
  },
};

/** Lets the UI label mocked surfaces without hardcoding the fact anywhere else. */
export const VENUES_ENDPOINT_READY = false;
