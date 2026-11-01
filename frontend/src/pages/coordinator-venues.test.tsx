import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import type { Venue } from '@/types/api';
import { CoordinatorVenues } from './coordinator-venues';

/**
 * UI tests for US-18 (Search and filter venues by date, capacity,
 * accessibility, facilities): the Coordinator's venue search page, rendered
 * with React Testing Library, API mocked. Which venues the server returns for
 * each filter is proven by test/venues-search.e2e-spec.ts; the browser journey
 * by e2e/us16-us19-venues.spec.ts.
 */

vi.mock('@/features/venues/api/venues.api', () => ({ venuesApi: { search: vi.fn() } }));
// Narrow screen: the filters open from a Filters button on the page (on a wide
// screen they move into the app shell's sidebar, which isn't rendered here).
vi.mock('@/lib/use-media-query', () => ({ SIDEBAR_BREAKPOINT: '', useMediaQuery: () => false }));

const api = vi.mocked(venuesApi);

const mainHall = {
  id: 'VEN-002',
  name: 'Main Hall',
  location: 'Block A, Level 1',
  capacity: 300,
  facilities: ['PROJECTOR', 'SOUND_SYSTEM', 'STAGE'],
  accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
  supportedLayouts: ['THEATRE', 'BANQUET'],
  imageUrls: [],
  status: 'PUBLISHED',
} as unknown as Venue;

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CoordinatorVenues />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const lastQuery = () => api.search.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  api.search.mockResolvedValue([mainHall]);
});

describe('US-18 AC-2 to AC-5: the filters are sent together', () => {
  // TC-S2-23 · US-18 AC-2, AC-3, AC-4, AC-5 · fails if a chosen capacity, accessibility feature or facility was not sent, or the filters were sent separately
  // Code: VenueFilterPanel keeps every filter in one draft; Apply filters -> toSearchQuery() -> one GET /venues/search with all of them.
  it('sends minimum capacity, accessibility and facilities in one search when Apply is pressed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Main Hall');
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    await user.type(screen.getByLabelText('Minimum capacity'), '100');
    const access = within(screen.getByRole('group', { name: /Accessibility — venue must have all selected/ }));
    await user.click(access.getByRole('button', { name: /Step-free/i }));
    const facilities = within(screen.getByRole('group', { name: /Facilities — venue must have all selected/ }));
    await user.click(facilities.getByRole('button', { name: 'Projector' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() =>
      // toSearchQuery() sends each list comma-separated; the API's toList() splits it.
      expect(lastQuery()).toMatchObject({
        minCapacity: 100,
        accessibility: 'STEP_FREE_ACCESS',
        facilities: 'PROJECTOR',
      }),
    );
  });
});

describe('US-18 AC-6: a clear "no results" state', () => {
  // TC-S2-25 · US-18 AC-6 · fails if a search with no matches showed an empty or broken list instead of a clear message
  // Code: an empty result with active filters renders EmptyState "No venues match your filters" with a Clear filters button.
  it('says no venues match, and offers to clear the filters', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Main Hall');
    api.search.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    await user.type(screen.getByLabelText('Minimum capacity'), '5000');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByText('No venues match your filters')).toBeInTheDocument();
    expect(screen.queryByText('Main Hall')).not.toBeInTheDocument();
    api.search.mockResolvedValue([mainHall]);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Main Hall')).toBeInTheDocument();
  });
});
