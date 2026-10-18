import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VenueBooking } from '@/types/api';
import { bookingsApi } from '../api/bookings.api';
import { NeedsReviewBadge } from './needs-review-badge';
import { ReviewFlagPanel } from './review-flag-panel';

vi.mock('../api/bookings.api', () => ({ bookingsApi: { resolveReview: vi.fn() } }));

const api = vi.mocked(bookingsApi);

const flagged = {
  id: 'b1',
  status: 'APPROVED',
  needsReview: true,
  needsReviewReason: 'Clashes with "Lunch talk" (2030-10-01 12:30–14:00 UTC) under 30/45 min setup/turnaround buffers.',
} as VenueBooking;

const renderPanel = (booking: VenueBooking) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReviewFlagPanel booking={booking} />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('US-51 conflict review flag', () => {
  it('US-51 AC-5: the badge reads "Conflict – needs review"', () => {
    render(<NeedsReviewBadge />);

    expect(screen.getByText('Conflict – needs review')).toBeInTheDocument();
  });

  it('US-51 AC-5: a flagged booking shows why it was flagged', () => {
    renderPanel(flagged);

    expect(screen.getByText(/Lunch talk/)).toBeInTheDocument();
  });

  it('US-51: Mark resolved sends the optional note', async () => {
    api.resolveReview.mockResolvedValue({ ...flagged, needsReview: false });
    renderPanel(flagged);

    await userEvent.type(screen.getByLabelText(/Resolution note/), 'Agreed shorter setup');
    await userEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));

    await waitFor(() => expect(api.resolveReview).toHaveBeenCalledWith('b1', 'Agreed shorter setup'));
  });

  it('US-51: nothing is shown for a booking that is not flagged', () => {
    const { container } = renderPanel({ ...flagged, needsReview: false });

    expect(container).toBeEmptyDOMElement();
  });
});
