import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { VenueBooking } from '@/types/api';
import { BookingDetails } from './booking-details';

const booking = (overrides: Partial<VenueBooking> = {}) =>
  ({
    id: 'BKG-001',
    eventId: 'EVT-001',
    venueId: 'VEN-001',
    status: 'REQUESTED',
    start: '2030-11-20T10:00:00.000Z',
    end: '2030-11-20T14:00:00.000Z',
    expectedAttendance: 120,
    preferredLayout: null,
    layoutNotes: null,
    accessibilityRequirements: [],
    accessibilityNotes: null,
    equipmentNeeds: 'Bring spare batteries',
    requiredFacilities: ['PROJECTOR', 'STAGE'],
    equipmentRequirements: [
      { equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
      { equipmentType: 'Fog machine', quantity: 1, notes: null },
    ],
    technicalSupportNeeds: 'A technician for sound checks',
    createdAt: '2030-09-01T09:00:00.000Z',
    venue: { id: 'VEN-001', name: 'Main Hall', location: null, capacity: 200 },
    event: {
      id: 'EVT-001',
      name: 'Orientation',
      status: 'PLANNING',
      organiser: { id: 'USR-001', name: 'Olivia', email: 'o@example.com' },
    },
    requestedBy: null,
    decisions: [],
    ...overrides,
  }) as unknown as VenueBooking;

const renderDetails = (view: VenueBooking) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BookingDetails booking={view} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** The value under a label in the details, e.g. "Technical support". */
const valueOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!;

describe('Story 20 AC-2: technical requirements on the booking request', () => {
  // TC-S2-35 · US-20 AC-2 · fails if Venue Staff could not see each equipment line on the request
  // Code: BookingDetails lists equipmentRequirements with quantity and notes.
  it('Given the request carries equipment lines, Then each is listed with its quantity and notes', () => {
    renderDetails(booking());

    const lines = within(screen.getByRole('list', { name: 'Equipment requested' })).getAllByRole('listitem');
    expect(lines.map((li) => li.textContent)).toEqual(['2 × Projector (HDMI)', '1 × Fog machine']);
  });

  // TC-S2-35 · US-20 AC-2 · fails if the technical support, facilities or notes were missing from the request
  // Code: BookingDetails shows technicalSupportNeeds, requiredFacilities and equipmentNeeds.
  it('Then the technical support, required facilities and free-text notes are shown', () => {
    renderDetails(booking());

    expect(valueOf('Technical support').textContent).toBe('A technician for sound checks');
    expect(valueOf('Required facilities').textContent).toBe('Projector, Stage');
    expect(valueOf('Equipment notes').textContent).toBe('Bring spare batteries');
  });

  // TC-S2-35 · US-20 AC-2 · fails if "none recorded" looked like a blank
  // Code: empty lists and nulls render as "None recorded".
  it('Given none were recorded, Then each says so', () => {
    renderDetails(
      booking({ equipmentRequirements: [], technicalSupportNeeds: null, requiredFacilities: [], equipmentNeeds: null }),
    );

    expect(valueOf('Equipment requested').textContent).toBe('None recorded');
    expect(valueOf('Technical support').textContent).toBe('None recorded');
    expect(valueOf('Required facilities').textContent).toBe('None recorded');
  });

  // TC-S2-35 · US-20 AC-2 · fails if an older request seemed to have no requirements
  // Code: equipmentRequirements null renders as not recorded on this request.
  it('Given a request made before these were attached, Then it says they were not recorded on it', () => {
    renderDetails(booking({ equipmentRequirements: null, technicalSupportNeeds: null, requiredFacilities: [] }));

    expect(valueOf('Equipment requested').textContent).toBe('Not recorded on this request');
    expect(valueOf('Technical support').textContent).toBe('Not recorded on this request');
    expect(valueOf('Required facilities').textContent).toBe('Not recorded on this request');
  });
});
