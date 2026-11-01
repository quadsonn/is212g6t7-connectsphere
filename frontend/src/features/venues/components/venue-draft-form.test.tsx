import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { venuesApi } from '@/features/venues/api/venues.api';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  FACILITY_LABELS,
  type Venue,
  type VenueWithWarnings,
} from '@/types/api';
import { VenueDraftForm } from './venue-draft-form';

/**
 * UI tests for US-13 (Add a new venue with its key characteristics) and US-14
 * (Update a venue's details as facilities change): the venue form Venue Staff
 * use on /venues/new and /venues/:id/edit, rendered with React Testing
 * Library, API mocked. The server's rules are proven by test/venues.e2e-spec.ts
 * and test/venues-update.e2e-spec.ts; the browser journey by
 * e2e/us13-us15-venues.spec.ts.
 */

// Every venuesApi method is a mock; the ones a test relies on are set below.
vi.mock('@/features/venues/api/venues.api', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    venuesApi: new Proxy(fns, {
      get: (target, key: string) => (target[key] ??= vi.fn().mockResolvedValue([])),
    }),
  };
});

const api = vi.mocked(venuesApi);

const http400 = (messages: string[]) =>
  new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    statusText: 'Bad Request',
    data: { statusCode: 400, message: messages, error: 'Bad Request' },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

/** Main Hall as in test/fixtures/sql/base-venues.sql. */
const mainHall: Venue = {
  id: 'VEN-002',
  name: 'Main Hall',
  location: 'Block A, Level 1',
  capacity: 300,
  facilities: ['PROJECTOR', 'SOUND_SYSTEM', 'STAGE'],
  facilityNotes: null,
  accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
  accessibilityNotes: null,
  supportedLayouts: ['THEATRE', 'BANQUET'],
  operatingInfo: '8:00 AM – 10:00 PM',
  setupMinutes: 0,
  turnaroundMinutes: 0,
  status: 'PUBLISHED',
  managedById: 'USR-010',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  imageUrls: [],
};

const renderNew = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <VenueDraftForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const renderEdit = (venue: Venue = mainHall) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <VenueDraftForm venueId={venue.id} initialValues={venue} initialStatus={venue.status} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const chip = (group: string, label: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  api.createDraft.mockResolvedValue({ ...mainHall, id: 'VEN-005', status: 'DRAFT' });
  api.update.mockResolvedValue({ ...mainHall, warnings: [] } as VenueWithWarnings);
});

describe('US-13: adding a venue', () => {
  // TC-S1-96 · US-13 AC-1 · fails if the form lacked a field for location, capacity, facilities, accessibility, layouts or operating hours, or did not send what was entered
  // Code: VenueDraftForm has inputs for name, location and capacity, ChipGroups over FACILITIES, ACCESSIBILITY_FEATURES
  // and ROOM_LAYOUTS, and an hours picker; Save draft -> venuesApi.createDraft(form).
  it('AC-1: offers every venue detail and sends what was entered', async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(screen.getByLabelText(/Venue name/), 'Campus Green');
    await user.type(screen.getByLabelText(/Location/), 'Outdoor, adjacent to Library');
    await user.type(screen.getByLabelText(/Capacity/), '800');
    await user.click(chip('Facilities', FACILITY_LABELS.POWER_OUTLETS));
    await user.click(chip('Accessibility features', ACCESSIBILITY_FEATURE_LABELS.STEP_FREE_ACCESS));
    await user.click(chip('Supported layouts', 'Banquet'));
    await user.selectOptions(screen.getByLabelText(/Operating hours/), '08:00');
    await user.selectOptions(document.getElementById('venue-operating-end')!, '22:00');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(api.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Campus Green',
        location: 'Outdoor, adjacent to Library',
        capacity: 800,
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        supportedLayouts: ['BANQUET'],
        operatingInfo: '8:00 AM – 10:00 PM',
      }),
    );
  });

  // TC-S1-97 · US-13 AC-2 · fails if a venue with nothing filled in could not be saved as a draft
  // Code: Save draft is never disabled by missing fields; createDraft() is called and "Draft saved." shown.
  it('AC-2: saves an empty form as a draft', async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(api.createDraft).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Draft saved.');
  });

  // TC-S1-98 · US-13 AC-3 · fails if Publish could be pressed before the name, location and capacity were all filled in
  // Code: isPublishable mirrors PublishableVenueDto (name, location, capacity > 0); Publish is disabled until it holds.
  it('AC-3: keeps Publish disabled until the required fields are complete', async () => {
    const user = userEvent.setup();
    renderNew();
    const publish = screen.getByRole('button', { name: 'Publish to catalogue' });

    expect(publish).toBeDisabled();
    await user.type(screen.getByLabelText(/Venue name/), 'Sandbox Auditorium');
    await user.type(screen.getByLabelText(/Location/), 'Level 1');
    expect(publish).toBeDisabled(); // still no capacity, the AC's example
    await user.type(screen.getByLabelText(/Capacity/), '420');

    expect(publish).toBeEnabled();
  });

  // TC-S1-98 · US-13 AC-3 · fails if the server's refusal to publish was not shown against the missing field
  // Code: handlePublish() maps the 400 messages to fields with fieldErrors(); the field shows it and is aria-invalid.
  it('AC-3: shows the server’s refusal against the field that is missing', async () => {
    const user = userEvent.setup();
    api.publish.mockRejectedValue(http400(['capacity is required before publishing']));
    renderNew();

    await user.type(screen.getByLabelText(/Venue name/), 'Sandbox Auditorium');
    await user.type(screen.getByLabelText(/Location/), 'Level 1');
    await user.type(screen.getByLabelText(/Capacity/), '420');
    await user.click(screen.getByRole('button', { name: 'Publish to catalogue' }));

    await screen.findAllByText(/capacity is required/i);
    expect(document.getElementById('venue-capacity-error')).toHaveTextContent(/capacity is required/i);
    expect(screen.getByLabelText(/Capacity/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('US-14: editing a venue', () => {
  // TC-S1-103 · US-14 AC-1 · fails if the edit form did not start from the venue's current details, or a change was not sent for that venue
  // Code: VenueEditRequest passes the venue as initialValues; Save changes -> venuesApi.update(id, form).
  it('AC-1: opens with the current details and saves an edit to that venue', async () => {
    const user = userEvent.setup();
    renderEdit();

    expect(screen.getByLabelText(/Venue name/)).toHaveValue('Main Hall');
    expect(screen.getByLabelText(/Capacity/)).toHaveValue(300);
    expect(chip('Facilities', FACILITY_LABELS.STAGE)).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Supported layouts', 'Banquet')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Operating hours/)).toHaveValue('08:00');

    await user.clear(screen.getByLabelText(/Capacity/));
    await user.type(screen.getByLabelText(/Capacity/), '250');
    await user.click(chip('Accessibility features', ACCESSIBILITY_FEATURE_LABELS.HEARING_LOOP));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(api.update).toHaveBeenCalledWith('VEN-002', expect.objectContaining({
      capacity: 250,
      accessibilityFeatures: ['STEP_FREE_ACCESS'],
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved.');
  });

  // TC-S1-103 · US-14 AC-1 · fails if a published venue offered a pointless Publish button
  // Code: Publish is shown only while status !== PUBLISHED.
  it('AC-1: does not offer to publish a venue that is already published', () => {
    renderEdit();

    expect(screen.queryByRole('button', { name: 'Publish to catalogue' })).not.toBeInTheDocument();
  });

  // TC-S1-105 · US-14 AC-3 · fails if the Venue Staff member was not told on screen that existing bookings may need review
  // Code: persist() keeps the warnings from PATCH /venues/:id; each is shown as an alert under the form (added in this regeneration).
  it('AC-3: shows the warning when the change may affect existing bookings', async () => {
    const user = userEvent.setup();
    api.update.mockResolvedValue({
      ...mainHall,
      capacity: 100,
      warnings: [
        {
          code: 'BOOKINGS_MAY_NEED_REVIEW',
          message: '1 existing booking(s) on this venue may need review: capacity reduced from 300 to 100',
          reasons: ['capacity reduced from 300 to 100'],
          affectedBookingIds: ['BKG-001'],
        },
      ],
    });
    renderEdit();

    await user.clear(screen.getByLabelText(/Capacity/));
    await user.type(screen.getByLabelText(/Capacity/), '100');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Existing bookings may need review');
    expect(alert).toHaveTextContent('capacity reduced from 300 to 100');
    expect(screen.getByRole('status')).toHaveTextContent('Changes saved.');
  });

  // TC-S1-105 · US-14 AC-3 · fails if a harmless edit showed a false alarm
  // Code: an empty warnings list renders nothing.
  it('AC-3: shows no warning when nothing is at risk', async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // TC-S1-106 · US-14 AC-4 · fails if a required field cleared on a published venue looked saved, or the field was not flagged
  // Code: the API refuses (400 "name is required before publishing"); fieldErrors() puts it under Venue name; no success message.
  it('AC-4: flags a cleared required field and does not report it saved', async () => {
    const user = userEvent.setup();
    api.update.mockRejectedValue(http400(['name is required before publishing']));
    renderEdit();

    await user.clear(screen.getByLabelText(/Venue name/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findAllByText(/name is required/i);
    expect(document.getElementById('venue-name-error')).toHaveTextContent(/name is required/i);
    expect(screen.getByLabelText(/Venue name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
