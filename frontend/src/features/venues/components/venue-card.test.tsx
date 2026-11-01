import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS } from '@/features/venues/search-filters';
import type { Venue } from '@/types/api';
import { VenueCard } from './venue-card';

const venue = (over: Partial<Venue> = {}): Venue =>
  ({
    id: 'VEN-007',
    name: 'Harbour Hall',
    location: 'Marina Building, Level 2',
    capacity: 300,
    imageUrls: [],
    accessibilityFeatures: ['STEP_FREE_ACCESS'],
    facilities: ['POWER_OUTLETS'],
    ...over,
  }) as Venue;

const renderCard = (v: Venue, applied = EMPTY_FILTERS) =>
  render(
    <MemoryRouter initialEntries={['/coordinator/venues']}>
      <Routes>
        <Route
          path="/coordinator/venues"
          element={
            <ul>
              <VenueCard venue={v} applied={applied} />
            </ul>
          }
        />
        <Route path="/coordinator/venues/:id" element={<p>Venue detail</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('US-18: venue result card', () => {
  it('shows the name, location and capacity', () => {
    renderCard(venue());

    expect(screen.getByRole('heading', { name: 'Harbour Hall' })).toBeInTheDocument();
    expect(screen.getByText('Marina Building, Level 2')).toBeInTheDocument();
    expect(screen.getByText('300 seats')).toBeInTheDocument();
  });

  it('opens the venue detail page from anywhere on the card', async () => {
    renderCard(venue());

    await userEvent.click(screen.getByRole('link', { name: /Harbour Hall/ }));

    expect(screen.getByText('Venue detail')).toBeInTheDocument();
  });

  it('uses the first photo as the cover', () => {
    const { container } = renderCard(
      venue({ imageUrls: ['https://example.test/a.jpg', 'https://example.test/b.jpg'] }),
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/a.jpg');
  });

  it('shows a placeholder, not a broken image, when the venue has no photos', () => {
    const { container } = renderCard(venue({ imageUrls: [] }));

    expect(container.querySelector('img')).toBeNull();
  });

  it('puts the tags the venue matched on first and collapses the rest into "+N"', () => {
    renderCard(
      venue({
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        facilities: ['POWER_OUTLETS', 'WIFI', 'PROJECTOR', 'WHITEBOARD'],
      }),
      { ...EMPTY_FILTERS, facilities: ['WHITEBOARD'] },
    );

    const tags = screen.getAllByText(/^(Step-free access|Power outlets|Wi-Fi|Projector|Whiteboard)$/);
    // The matched tag is announced as such to screen readers.
    expect(tags.map((t) => t.textContent)).toEqual([
      'Matches filter: Whiteboard',
      'Step-free access',
      'Power outlets',
    ]);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
