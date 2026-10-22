import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrganiserRequestView } from '@/types/api';
import { eventsApi } from '../api/events.api';
import { ClarificationPanel } from './clarification-panel';

vi.mock('../api/events.api', () => ({ eventsApi: { respondToClarification: vi.fn() } }));

const api = vi.mocked(eventsApi);

const coordinator = { id: 'USR-002', name: 'Marcus', email: 'm@example.com', role: 'EVENT_COORDINATOR' as const };
const organiser = { id: 'USR-001', name: 'Olive', email: 'o@example.com', role: 'EVENT_ORGANISER' as const };

const event = (overrides: Partial<OrganiserRequestView> = {}) =>
  ({
    id: 'EVT-001',
    name: 'Freshman Orientation',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: '2030-10-01T01:00:00.000Z',
    proposedEnd: '2030-10-01T09:00:00.000Z',
    expectedAttendance: 320,
    preferredLayout: null,
    layoutNotes: null,
    accessibilityRequirements: [],
    accessibilityNotes: null,
    equipmentNeeds: null,
    registrationEnabled: false,
    status: 'AWAITING_CLARIFICATION',
    clarificationRequest: 'How will people leave the hall?',
    clarifications: [
      {
        id: 'CLM-001',
        body: 'How many will attend?',
        createdAt: '2030-09-01T01:00:00.000Z',
        author: coordinator,
        change: null,
      },
      {
        id: 'CLM-002',
        body: 'About 320 now.',
        createdAt: '2030-09-01T02:00:00.000Z',
        author: organiser,
        change: { changes: [{ field: 'expectedAttendance', previous: 200, next: 320 }] },
      },
      {
        id: 'CLM-003',
        body: 'How will people leave the hall?',
        createdAt: '2030-09-01T03:00:00.000Z',
        author: coordinator,
        change: null,
      },
    ],
    ...overrides,
  }) as OrganiserRequestView;

const renderPanel = (view = event(), onResponded = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ClarificationPanel event={view} onResponded={onResponded} />
    </QueryClientProvider>,
  );
  return onResponded;
};

beforeEach(() => vi.resetAllMocks());

describe('US-58 clarification panel', () => {
  describe('AC4: the history, with each response’s changes beside it', () => {
    it('Given a thread, Then every message shows with its author, oldest first', () => {
      renderPanel();

      const entries = within(screen.getByRole('list', { name: 'Clarification history' })).getAllByRole('listitem');
      expect(entries.map((e) => within(e).getByText(/How many|About 320|How will people/).textContent)).toEqual([
        'How many will attend?',
        'About 320 now.',
        'How will people leave the hall?',
      ]);
      expect(within(entries[0]).getByText(/Marcus/)).toBeInTheDocument();
    });

    it('Given a response that updated details, Then it lists each field old -> new', () => {
      renderPanel();

      const answer = screen.getByText('About 320 now.').closest('li')!;
      expect(within(answer).getByText('Expected attendance')).toBeInTheDocument();
      expect(within(answer).getByText('200')).toBeInTheDocument();
      expect(within(answer).getByText('320')).toBeInTheDocument();
    });
  });

  describe('AC2: the reply form', () => {
    it('Given the request is awaiting clarification, Then the form is shown', () => {
      renderPanel();

      expect(screen.getByLabelText(/Your response/)).toBeInTheDocument();
    });

    it('Given the request is not awaiting clarification, Then the history shows but there is no form', () => {
      renderPanel(event({ status: 'UNDER_REVIEW', clarificationRequest: null }));

      expect(screen.getByRole('list', { name: 'Clarification history' })).toBeInTheDocument();
      expect(screen.queryByLabelText(/Your response/)).not.toBeInTheDocument();
    });

    it('AC6: Given a blank or whitespace-only response, Then it cannot be submitted', async () => {
      renderPanel();
      const submit = screen.getByRole('button', { name: 'Send response' });

      expect(submit).toBeDisabled();
      await userEvent.type(screen.getByLabelText(/Your response/), '   ');
      expect(submit).toBeDisabled();
    });

    it('AC2/AC5: Given text only, When sent, Then just the trimmed response goes to the server', async () => {
      api.respondToClarification.mockResolvedValue(event({ status: 'UNDER_REVIEW' }));
      const onResponded = renderPanel();

      await userEvent.type(screen.getByLabelText(/Your response/), '  Through both rear doors.  ');
      await userEvent.click(screen.getByRole('button', { name: 'Send response' }));

      await waitFor(() => expect(onResponded).toHaveBeenCalled());
      expect(api.respondToClarification).toHaveBeenCalledWith('EVT-001', {
        response: 'Through both rear doors.',
      });
    });
  });

  describe('AC3: updating details with the response', () => {
    it('Given the Organiser edits one field, When sent, Then only that field is sent as a change', async () => {
      api.respondToClarification.mockResolvedValue(event({ status: 'UNDER_REVIEW' }));
      renderPanel();

      await userEvent.click(screen.getByRole('button', { name: 'Update request details' }));
      await userEvent.type(screen.getByLabelText('Layout notes'), 'Second exit at the rear');
      await userEvent.type(screen.getByLabelText(/Your response/), 'Added a second exit.');
      await userEvent.click(screen.getByRole('button', { name: 'Send response' }));

      await waitFor(() =>
        expect(api.respondToClarification).toHaveBeenCalledWith('EVT-001', {
          response: 'Added a second exit.',
          changes: { layoutNotes: 'Second exit at the rear' },
        }),
      );
    });

    it('Given the details section is opened but nothing is changed, Then no changes are sent', async () => {
      api.respondToClarification.mockResolvedValue(event({ status: 'UNDER_REVIEW' }));
      renderPanel();

      await userEvent.click(screen.getByRole('button', { name: 'Update request details' }));
      await userEvent.type(screen.getByLabelText(/Your response/), 'No changes needed.');
      await userEvent.click(screen.getByRole('button', { name: 'Send response' }));

      await waitFor(() =>
        expect(api.respondToClarification).toHaveBeenCalledWith('EVT-001', { response: 'No changes needed.' }),
      );
    });

    it('Given the server refuses a change, Then the problem is shown and the form stays', async () => {
      api.respondToClarification.mockRejectedValue(new Error('proposedEnd must be later than proposedStart'));
      const onResponded = renderPanel();

      await userEvent.type(screen.getByLabelText(/Your response/), 'New times.');
      await userEvent.click(screen.getByRole('button', { name: 'Send response' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onResponded).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/Your response/)).toBeInTheDocument();
    });
  });
});
