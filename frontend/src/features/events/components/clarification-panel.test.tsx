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

    it("Given the Organiser's own message, Then it is labelled You, and the Coordinator's by name", () => {
      renderPanel(event({ organiserId: organiser.id }));

      const entries = within(screen.getByRole('list', { name: 'Clarification history' })).getAllByRole('listitem');
      expect(within(entries[1]).getByText('You')).toBeInTheDocument();
      expect(within(entries[1]).queryByText('Olive')).not.toBeInTheDocument();
      expect(within(entries[2]).getByText('Marcus')).toBeInTheDocument();
    });

    it('Given a question is waiting, Then the latest one is tagged "Waiting for your reply"', () => {
      renderPanel();

      const entries = within(screen.getByRole('list', { name: 'Clarification history' })).getAllByRole('listitem');
      expect(within(entries[2]).getByText('Waiting for your reply')).toBeInTheDocument();
      expect(entries[2]).toHaveAttribute('aria-current', 'true');
      expect(screen.getAllByText('Waiting for your reply')).toHaveLength(1);
    });

    it('Given the request is no longer waiting, Then no question is tagged', () => {
      renderPanel(event({ status: 'UNDER_REVIEW', clarificationRequest: null }));

      expect(screen.queryByText('Waiting for your reply')).not.toBeInTheDocument();
    });

    it('Then a timestamp reads like "1 Sept, 9:00 AM"', () => {
      renderPanel();

      const entries = within(screen.getByRole('list', { name: 'Clarification history' })).getAllByRole('listitem');
      expect(within(entries[0]).getByText(/^\d{1,2} \w{3,4}, \d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
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

    it('AC6: Given the response is empty, Then a hint says to write one and the counter reads 0/4000', () => {
      renderPanel();

      expect(screen.getByText('Write a response to send')).toBeInTheDocument();
      expect(screen.getByText('0/4000')).toBeInTheDocument();
    });

    it('Given the Organiser types, Then the hint goes and the counter counts the characters', async () => {
      renderPanel();

      await userEvent.type(screen.getByLabelText(/Your response/), 'Two exits.');

      expect(screen.queryByText('Write a response to send')).not.toBeInTheDocument();
      expect(screen.getByText('10/4000')).toBeInTheDocument();
    });

    it('AC6: Given the Organiser has not typed yet, Then no message is shown', () => {
      renderPanel();

      expect(screen.queryByText('Please write a response before sending.')).not.toBeInTheDocument();
    });

    it('AC6: Given the Organiser types then clears the response, Then an inline message says why Send is disabled', async () => {
      renderPanel();
      const box = screen.getByLabelText(/Your response/);

      await userEvent.type(box, 'Draft');
      await userEvent.clear(box);

      expect(screen.getByText('Please write a response before sending.')).toBeInTheDocument();
      expect(box).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('button', { name: 'Send response' })).toBeDisabled();
    });

    it('AC6: Given the Organiser leaves the box with only spaces, Then the message is shown', async () => {
      renderPanel();

      await userEvent.type(screen.getByLabelText(/Your response/), '   ');
      await userEvent.tab();

      expect(screen.getByText('Please write a response before sending.')).toBeInTheDocument();
    });

    it('AC6: Given the message is showing, When the Organiser writes something, Then it goes away', async () => {
      renderPanel();
      const box = screen.getByLabelText(/Your response/);
      await userEvent.type(box, ' ');
      await userEvent.tab();

      await userEvent.type(box, 'Two exits.');

      expect(screen.queryByText('Please write a response before sending.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send response' })).toBeEnabled();
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

      await userEvent.click(screen.getByRole('checkbox', { name: /Also change event details/ }));
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

      await userEvent.click(screen.getByRole('checkbox', { name: /Also change event details/ }));
      await userEvent.type(screen.getByLabelText(/Your response/), 'No changes needed.');
      await userEvent.click(screen.getByRole('button', { name: 'Send response' }));

      await waitFor(() =>
        expect(api.respondToClarification).toHaveBeenCalledWith('EVT-001', { response: 'No changes needed.' }),
      );
    });

    it('Given the toggle is off, Then the detail fields are hidden and the help text explains the option', () => {
      renderPanel();

      const toggle = screen.getByRole('checkbox', { name: /Also change event details/ });
      expect(toggle).not.toBeChecked();
      expect(toggle).toHaveAccessibleDescription(/sent with your response/);
      expect(screen.queryByLabelText('Layout notes')).not.toBeInTheDocument();
    });

    it('Given the toggle is turned on, Then the detail fields expand inline', async () => {
      renderPanel();

      await userEvent.click(screen.getByRole('checkbox', { name: /Also change event details/ }));

      expect(screen.getByLabelText('Layout notes')).toBeInTheDocument();
    });

    it('Given a field is edited and the toggle turned off again, When sent, Then no changes are sent', async () => {
      api.respondToClarification.mockResolvedValue(event({ status: 'UNDER_REVIEW' }));
      renderPanel();
      const toggle = screen.getByRole('checkbox', { name: /Also change event details/ });

      await userEvent.click(toggle);
      await userEvent.type(screen.getByLabelText('Layout notes'), 'Second exit');
      await userEvent.click(toggle);
      await userEvent.type(screen.getByLabelText(/Your response/), 'Never mind.');
      await userEvent.click(screen.getByRole('button', { name: 'Send response' }));

      await waitFor(() =>
        expect(api.respondToClarification).toHaveBeenCalledWith('EVT-001', { response: 'Never mind.' }),
      );
    });

    it('Given the toggle is turned back on after that, Then the edits were discarded', async () => {
      renderPanel();
      const toggle = screen.getByRole('checkbox', { name: /Also change event details/ });

      await userEvent.click(toggle);
      await userEvent.type(screen.getByLabelText('Layout notes'), 'Second exit');
      await userEvent.click(toggle);
      await userEvent.click(toggle);

      expect(screen.getByLabelText('Layout notes')).toHaveValue('');
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
