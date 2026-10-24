import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VenueSuitability } from '@/types/api';
import { venuesApi } from '../api/venues.api';
import { VenueSuitabilityPanel } from './venue-suitability-panel';

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

describe('US-20 AC-3: facilities and equipment on the suitability panel', () => {
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

  it('Given no facilities are required, Then it says none required', async () => {
    api.suitability.mockResolvedValue(result());
    renderPanel();

    expect(await detailOf('Facilities')).toBe('None required');
    expect(await detailOf('Equipment')).toBe('None requested');
  });

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

  it('Then the panel explains equipment does not change the venue verdict', async () => {
    api.suitability.mockResolvedValue(result());
    renderPanel();

    expect(await screen.findByText(/same at every venue/)).toBeInTheDocument();
  });
});
