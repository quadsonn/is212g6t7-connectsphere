import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { venuesApi } from '@/features/venues/api/venues.api';
import { ACCESSIBILITY_FEATURE_LABELS, FACILITY_LABELS, type Venue } from '@/types/api';
import { VenueDashboard } from './venue-dashboard';
import { VenueEditRequest } from './venue-edit-request';

/**
 * UI tests for US-15 (Browse the full catalogue of venues) and US-13 AC-6 (a
 * Venue Staff member can tell published venues from drafts): the Venue
 * Staff's catalogue on /venues and the venue it opens, rendered with React
 * Testing Library, API mocked. The server's scoping, search and sort are
 * proven by test/venues-browse.e2e-spec.ts; the browser journey by
 * e2e/us13-us15-venues.spec.ts.
 */

vi.mock('@/features/venues/api/venues.api', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    venuesApi: new Proxy(fns, {
      get: (target, key: string) => (target[key] ??= vi.fn().mockResolvedValue([])),
    }),
  };
});

// The edit page's setup-time card reads who is signed in: the Venue Staff
// member who manages the venues below.
vi.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: vi.fn() }));

const api = vi.mocked(venuesApi);

const venue = (overrides: Partial<Venue>): Venue => ({
  id: 'VEN-000',
  name: null,
  location: null,
  capacity: null,
  facilities: [],
  facilityNotes: null,
  accessibilityFeatures: [],
  accessibilityNotes: null,
  supportedLayouts: [],
  operatingInfo: null,
  setupMinutes: 0,
  turnaroundMinutes: 0,
  status: 'PUBLISHED',
  managedById: 'USR-010',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  imageUrls: [],
  ...overrides,
});

/** The catalogue in test/fixtures/sql/base-venues.sql, as its manager sees it. */
const draft = venue({ id: 'VEN-001', name: 'Annex (draft)', status: 'DRAFT' });
const mainHall = venue({
  id: 'VEN-002',
  name: 'Main Hall',
  location: 'Block A, Level 1',
  capacity: 300,
  facilities: ['PROJECTOR', 'SOUND_SYSTEM', 'STAGE'],
  accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
  supportedLayouts: ['THEATRE', 'BANQUET'],
  operatingInfo: '8:00 AM – 10:00 PM',
});
const rooftop = venue({ id: 'VEN-004', name: 'Rooftop Terrace', location: 'Block C, Roof', capacity: 120 });
const seminar = venue({ id: 'VEN-038', name: 'Seminar Room', location: 'Block B, Level 3', capacity: 40 });

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/venues" element={<VenueDashboard />} />
          <Route path="/venues/:id/edit" element={<VenueEditRequest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const lastQuery = () => api.list.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue([draft, mainHall, rooftop, seminar]);
  api.getById.mockResolvedValue(mainHall);
  vi.mocked(useAuth).mockReturnValue({
    session: { userId: 'USR-010', role: 'VENUE_STAFF', email: 'venue.staff@example.com' },
  } as ReturnType<typeof useAuth>);
});

describe('US-15 AC-1: the catalogue shows every venue at a glance', () => {
  // TC-S1-108 · US-15 AC-1 · fails if a venue was missing from the catalogue, or its row lacked the name, location or capacity
  // Code: VenueDashboard renders one row per venue from GET /venues, with Venue, Location and Capacity columns.
  it('lists each venue with its name, location and capacity', async () => {
    renderAt('/venues');

    await screen.findByText('Main Hall');
    expect(screen.getAllByRole('row')).toHaveLength(5); // header + 4 venues
    expect(within(row('Main Hall')).getByText('Block A, Level 1')).toBeInTheDocument();
    expect(within(row('Main Hall')).getByText('300')).toBeInTheDocument();
    expect(within(row('Seminar Room')).getByText('40')).toBeInTheDocument();
  });

  // TC-S1-108 · US-15 AC-1 · fails if a layout showed as a raw code rather than in words
  // Code: supportedLayouts are humanised ("THEATRE" -> "Theatre"), fixed in this regeneration.
  it('shows supported layouts in words', async () => {
    renderAt('/venues');

    expect(await within(await screen.findByRole('row', { name: /Main Hall/ })).findByText('Theatre · Banquet')).toBeInTheDocument();
  });
});

describe('US-13 AC-6: published and draft venues are told apart', () => {
  // TC-S1-101 · US-13 AC-6 · fails if a draft and a published venue looked the same in the catalogue
  // Code: each row has a State badge from VENUE_STATUS_STYLES ("Draft" / "Published"), with an sr-only "State:" prefix.
  it('labels each venue Draft or Published', async () => {
    renderAt('/venues');

    await screen.findByText('Main Hall');
    expect(within(row('Annex')).getByText('Draft')).toBeInTheDocument();
    expect(within(row('Main Hall')).getByText('Published')).toBeInTheDocument();
    expect(within(row('Annex')).queryByText('Published')).not.toBeInTheDocument();
  });
});

describe('US-15 AC-3: finding a venue without scrolling', () => {
  // TC-S1-110 · US-15 AC-3 · fails if typing a name did not look the venue up
  // Code: the search box feeds useVenues({ search }), sent to GET /venues?search=; the server filters.
  it('looks a venue up by name', async () => {
    const user = userEvent.setup();
    renderAt('/venues');
    await screen.findByText('Main Hall');
    api.list.mockResolvedValue([mainHall]);

    await user.type(screen.getByRole('searchbox', { name: 'Search venues by name' }), 'hall');

    expect(lastQuery()).toMatchObject({ search: 'hall' });
    await screen.findByText('Main Hall');
    expect(screen.queryByText('Seminar Room')).not.toBeInTheDocument();
  });

  // TC-S1-110 · US-15 AC-3 · fails if a lookup that found nothing looked like an empty catalogue
  // Code: an empty result with a search shows "No venues match that search".
  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    renderAt('/venues');
    await screen.findByText('Main Hall');
    api.list.mockResolvedValue([]);

    await user.type(screen.getByRole('searchbox', { name: 'Search venues by name' }), 'zzz');

    expect(await screen.findByText('No venues match that search')).toBeInTheDocument();
  });

  // TC-S1-110 · US-15 AC-3 · fails if the catalogue could not be sorted by capacity or location, in either direction
  // Code: the "Sort venues by" select sets sortBy; the direction button toggles sortOrder asc/desc.
  it('sorts by the chosen field, in either direction', async () => {
    const user = userEvent.setup();
    renderAt('/venues');
    await screen.findByText('Main Hall');
    expect(lastQuery()).toMatchObject({ sortBy: 'name', sortOrder: 'asc' });

    await user.selectOptions(screen.getByLabelText('Sort venues by'), 'capacity');
    expect(lastQuery()).toMatchObject({ sortBy: 'capacity', sortOrder: 'asc' });

    await user.click(screen.getByRole('button', { name: /click to sort descending/ }));
    expect(lastQuery()).toMatchObject({ sortBy: 'capacity', sortOrder: 'desc' });
  });
});

describe('US-15 AC-2: selecting a venue shows its full details', () => {
  // TC-S1-109 · US-15 AC-2 · fails if opening a venue from the catalogue did not show its facilities, accessibility, layouts and operating hours
  // Code: Edit -> /venues/:id/edit (VenueEditRequest), which loads GET /venues/:id into the venue form.
  it('opens the venue with every detail shown', async () => {
    const user = userEvent.setup();
    renderAt('/venues');

    await user.click(within(await screen.findByRole('row', { name: /Main Hall/ })).getByRole('button', { name: 'Edit' }));

    expect(api.getById).toHaveBeenCalledWith('VEN-002');
    expect(await screen.findByLabelText(/Venue name/)).toHaveValue('Main Hall');
    const pressed = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button', { pressed: true })
        .map((b) => b.textContent);
    expect(pressed('Facilities')).toEqual([FACILITY_LABELS.PROJECTOR, FACILITY_LABELS.SOUND_SYSTEM, FACILITY_LABELS.STAGE]);
    expect(pressed('Accessibility features')).toEqual([
      ACCESSIBILITY_FEATURE_LABELS.STEP_FREE_ACCESS,
      ACCESSIBILITY_FEATURE_LABELS.HEARING_LOOP,
    ]);
    expect(pressed('Supported layouts').sort()).toEqual(['Banquet', 'Theatre']);
    expect(screen.getByLabelText(/Operating hours/)).toHaveValue('08:00');
    expect(document.getElementById('venue-operating-end')).toHaveValue('22:00');
  });
});
