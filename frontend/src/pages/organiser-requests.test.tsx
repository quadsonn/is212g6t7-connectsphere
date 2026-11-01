import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eventsApi } from '@/features/events/api/events.api';
import type { EventStatus, OrganiserRequestView } from '@/types/api';
import { OrganiserDashboard } from './organiser-dashboard';
import { OrganiserNewRequest } from './organiser-new-request';

/**
 * UI tests for US-03 (Submit a new event request) and US-04 (Save an
 * incomplete request as a draft): the request form and the Organiser's list,
 * rendered with React Testing Library, API mocked. The server's rules are
 * proven by test/events-submit.e2e-spec.ts and test/events-draft.e2e-spec.ts;
 * the browser journey by e2e/us03-us04-event-request.spec.ts.
 */

// Every eventsApi method is a mock; the ones a test relies on are set below.
vi.mock('@/features/events/api/events.api', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    eventsApi: new Proxy(fns, {
      get: (target, key: string) => (target[key] ??= vi.fn().mockResolvedValue([])),
    }),
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = vi.mocked(eventsApi);

const http400 = (messages: string[]) =>
  new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    statusText: 'Bad Request',
    data: { statusCode: 400, message: messages, error: 'Bad Request' },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/organiser/new" element={<OrganiserNewRequest />} />
          <Route path="/organiser" element={<><OrganiserDashboard /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const request = (id: string, name: string | null, status: EventStatus): OrganiserRequestView =>
  ({
    id,
    name,
    purpose: name ? 'Purpose' : null,
    category: null,
    status,
    proposedStart: null,
    proposedEnd: null,
    expectedAttendance: null,
    statusView: { status, decision: null, clarification: null },
  }) as unknown as OrganiserRequestView;

beforeEach(() => {
  vi.clearAllMocks();
  api.listMine.mockResolvedValue([]);
});

describe('US-03: the new event request form', () => {
  // TC-S1-76 · US-03 AC-3 · fails if a refused submission was not flagged against each offending field
  // Code: OrganiserNewRequest maps the API's 400 messages to fields (fieldErrors) and shows each under its input.
  it('AC-3: Given the API refuses the submission, Then each offending field is flagged with its own message', async () => {
    api.createAndSubmit.mockRejectedValue(
      http400(['name is required', 'proposedStart must be in the future', 'expectedAttendance must be a whole number']),
    );
    renderAt('/organiser/new');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('Please enter an event name.')).toBeInTheDocument();
    expect(screen.getByText('The start date and time must be in the future.')).toBeInTheDocument();
    expect(screen.getByText('Expected attendance must be a whole number.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Event name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Category/)).not.toHaveAttribute('aria-invalid', 'true');
    expect(toast.success).not.toHaveBeenCalled();
  });

  // TC-S1-76 · US-03 AC-2 · fails if a successful submission gave the Organiser no confirmation
  // Code: after createAndSubmit() resolves, the form calls toast.success('Request submitted for review.') and opens the list.
  it('AC-2: Given the submission succeeds, Then the Organiser is told and taken to their requests', async () => {
    api.createAndSubmit.mockResolvedValue(request('EVT-500', 'Orientation', 'SUBMITTED'));
    api.listMine.mockResolvedValue([request('EVT-500', 'Orientation', 'SUBMITTED')]);
    renderAt('/organiser/new');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Event name/), 'Orientation');
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(toast.success).toHaveBeenCalledWith('Request submitted for review.');
    expect(await screen.findByTestId('where')).toHaveTextContent('/organiser');
    expect(api.createAndSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Orientation' }));
  });
});

describe('US-04: drafts', () => {
  // TC-S1-77 · US-04 AC-1 · fails if "Save as draft" sent the request for review, or needed the required fields
  // Code: the draft button calls eventsApi.saveDraft (POST /events/drafts), never createAndSubmit.
  it('AC-1: Given required fields are empty, When "Save as draft" is chosen, Then it is saved as a draft and confirmed', async () => {
    api.saveDraft.mockResolvedValue(request('EVT-501', 'Half done', 'DRAFT'));
    renderAt('/organiser/new');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Event name/), 'Half done');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ name: 'Half done', category: undefined }));
    expect(api.createAndSubmit).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Draft saved.');
  });

  // TC-S1-34 · US-04 AC-3 · fails if a draft looked the same as a submitted request in the list
  // Code: EventStatusBadge renders EVENT_STATUS_STYLES[status]: label "Draft" in grey vs "Submitted" in its own colour.
  it('AC-3: Given a draft and a submitted request, Then the list labels them "Draft" and "Submitted" in different styles', async () => {
    api.listMine.mockResolvedValue([
      request('EVT-502', 'Still planning', 'DRAFT'),
      request('EVT-503', 'Sent off', 'SUBMITTED'),
    ]);
    renderAt('/organiser');

    const draftRow = (await screen.findByText('Still planning')).closest('tr') as HTMLElement;
    const submittedRow = screen.getByText('Sent off').closest('tr') as HTMLElement;
    const draftBadge = within(draftRow).getByText('Draft');
    const submittedBadge = within(submittedRow).getByText('Submitted');

    expect(draftBadge.className).not.toEqual(submittedBadge.className);
    expect(within(submittedRow).queryByText('Draft')).not.toBeInTheDocument();
  });

  // TC-S1-34 · US-04 AC-3 · fails if a draft with no name yet vanished from the list or showed a blank row
  // Code: the list shows "Untitled draft" when name is null.
  it('AC-3: Given a draft with no name yet, Then it still appears, as "Untitled draft"', async () => {
    api.listMine.mockResolvedValue([request('EVT-504', null, 'DRAFT')]);
    renderAt('/organiser');

    const row = (await screen.findByText('Untitled draft')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Draft')).toBeInTheDocument();
  });
});
