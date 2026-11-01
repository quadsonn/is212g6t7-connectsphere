import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VenueSuitability } from '@/types/api';
import { venuesApi } from '../api/venues.api';
import { VenueSuitabilityPanel } from './venue-suitability-panel';

/**
 * UI tests for US-19 (System flags whether a venue appears suitable before
 * submitting): the suitability panel, rendered with React Testing Library,
 * API mocked. The checks themselves are proven by
 * test/venues-suitability.e2e-spec.ts.
 */

vi.mock('../api/venues.api', () => ({ venuesApi: { suitability: vi.fn() } }));

const api = vi.mocked(venuesApi);

const result = (overrides: Partial<VenueSuitability> = {}): VenueSuitability => ({
  overall: 'SUITABLE',
  overallSuitable: true,
  capacity: { status: 'MET', venueCapacity: 100, expectedAttendance: 80 },
  accessibility: { status: 'NOT_REQUIRED', items: [] },
  layout: { status: 'NOT_REQUIRED', requirement: null },
  facilities: { status: 'NOT_REQUIRED', items: [] },
  equipment: { status: 'NOT_REQUIRED', items: [] },
  notChecked: [],
  ...overrides,
});

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VenueSuitabilityPanel venueId="VEN-001" eventId="EVT-001" />
    </QueryClientProvider>,
  );

/** The text beside a check's label, e.g. the "Facilities" row's detail. */
const detailOf = async (label: string) => (await screen.findByText(label)).nextElementSibling?.textContent;

beforeEach(() => vi.resetAllMocks());

describe('US-19 AC-1, AC-2, AC-4: the verdict and each flag', () => {
  // TC-S2-28 · US-19 AC-4 · fails if a venue meeting every check showed no message, rather than a clear "suitable"
  // Code: overall SUITABLE renders the status line "Appears suitable", with each check marked Met.
  it('shows a clear "Appears suitable" when every check is met', async () => {
    api.suitability.mockResolvedValue(
      result({ accessibility: { status: 'MET', items: [{ requirement: 'STEP_FREE_ACCESS', met: true }] } }),
    );
    renderPanel();

    expect(await screen.findByText('Appears suitable')).toBeInTheDocument();
    expect(await detailOf('Accessibility')).toBe('Step-free access');
  });

  // TC-S2-29 · US-19 AC-1, AC-2 · fails if going over capacity was not flagged, or missing accessibility needs were lumped into one generic warning
  // Code: overall NOT_SUITABLE -> "May not be suitable"; the Capacity row is marked Not met; the Accessibility row
  // names each missing requirement ("Missing: …").
  it('flags over-capacity and names each missing accessibility requirement', async () => {
    api.suitability.mockResolvedValue(
      result({
        overall: 'NOT_SUITABLE',
        overallSuitable: false,
        capacity: { status: 'UNMET', venueCapacity: 100, expectedAttendance: 101 },
        accessibility: {
          status: 'UNMET',
          items: [
            { requirement: 'STEP_FREE_ACCESS', met: true },
            { requirement: 'HEARING_LOOP', met: false },
            { requirement: 'ACCESSIBLE_RESTROOMS', met: false },
          ],
        },
      }),
    );
    renderPanel();

    expect(await screen.findByText('May not be suitable')).toBeInTheDocument();
    for (const row of ['Capacity', 'Accessibility']) {
      expect(screen.getByText(row).closest('div')).toHaveTextContent('Not met');
    }
    expect(await detailOf('Accessibility')).toBe('Missing: Hearing loop, Wheelchair-accessible restrooms');
  });
});

describe('US-19 AC-3: facilities and equipment on the suitability panel', () => {
  // TC-S2-30 · US-19 AC-3 · fails if met facilities were not listed
  // Code: the Facilities row lists each item with FACILITY_LABELS.
  it('Given every required facility is met, Then the Facilities row lists them', async () => {
    api.suitability.mockResolvedValue(
      result({
        facilities: {
          status: 'MET',
          items: [
            { requirement: 'PROJECTOR', met: true },
            { requirement: 'MICROPHONE', met: true },
          ],
        },
      }),
    );
    renderPanel();

    expect(await detailOf('Facilities')).toBe('Projector, Microphones');
  });

  // TC-S2-30 · US-19 AC-3 · fails if a missing facility was not named
  // Code: an UNMET Facilities row names each item with met: false.
  it('Given a missing facility, Then the Facilities row names it', async () => {
    api.suitability.mockResolvedValue(
      result({
        overall: 'NOT_SUITABLE',
        overallSuitable: false,
        facilities: {
          status: 'UNMET',
          items: [
            { requirement: 'PROJECTOR', met: true },
            { requirement: 'STAGE', met: false },
          ],
        },
      }),
    );
    renderPanel();

    expect(await detailOf('Facilities')).toBe('Missing: Stage');
  });

  // TC-S2-30 · US-19 AC-3 · fails if "nothing required" read as a failure or a blank
  // Code: NOT_REQUIRED renders "None required".
  it('Given no facilities are required, Then it says none required', async () => {
    api.suitability.mockResolvedValue(result());
    renderPanel();

    expect(await detailOf('Facilities')).toBe('None required');
    expect(await detailOf('Equipment')).toBe('None requested');
  });

  // TC-S2-184 · US-19 AC-3 · fails if an equipment shortfall was not shown with the free count
  // Code: the Equipment row shows requested and available quantity for an unavailable item.
  it('Given an equipment item is short, Then the Equipment row says how many are free', async () => {
    api.suitability.mockResolvedValue(
      result({
        equipment: {
          status: 'UNMET',
          items: [
            { item: 'Wireless mic', requestedQuantity: 4, availableQuantity: 6, available: true },
            { item: 'Laptop', requestedQuantity: 3, availableQuantity: 1, available: false },
          ],
        },
      }),
    );
    renderPanel();

    expect(await detailOf('Equipment')).toBe('Short: Laptop (1 of 3 free)');
  });

  // TC-S2-184 · US-19 AC-3 · fails if available equipment was not listed
  // Code: a MET Equipment row lists each item.
  it('Given all equipment is available, Then the Equipment row lists it', async () => {
    api.suitability.mockResolvedValue(
      result({
        equipment: {
          status: 'MET',
          items: [{ item: 'Wireless mic', requestedQuantity: 4, availableQuantity: 6, available: true }],
        },
      }),
    );
    renderPanel();

    expect(await detailOf('Equipment')).toBe('4 × Wireless mic available');
  });

  // TC-S2-184 · US-19 AC-3 · fails if an uncheckable line looked like a pass
  // Code: notChecked entries are shown with their reason.
  it('Given a free-text equipment line, Then the panel says it was not checked, with the reason', async () => {
    api.suitability.mockResolvedValue(
      result({
        equipment: {
          status: 'NOT_RECORDED',
          items: [{ item: 'Fog machine', requestedQuantity: 1, availableQuantity: null, available: null }],
        },
        notChecked: [
          {
            check: 'equipment',
            reason: '1 equipment line is not linked to the catalogue, so its availability was not checked.',
          },
        ],
      }),
    );
    renderPanel();

    expect(await detailOf('Equipment')).toBe('Not checked: Fog machine');
    expect(screen.getByText(/1 equipment line is not linked to the catalogue/)).toBeVisible();
  });

  // TC-S2-184 · US-19 AC-3, AC-4 · fails if a Coordinator could think a shortage made the venue unsuitable
  // Code: the panel notes that equipment is the same at every venue, so it does not change the
  // verdict.
  it('Then the panel explains equipment does not change the venue verdict', async () => {
    api.suitability.mockResolvedValue(result());
    renderPanel();

    expect(await screen.findByText(/same at every venue/)).toBeInTheDocument();
  });
});
