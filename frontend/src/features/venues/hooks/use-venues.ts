import { useQuery } from '@tanstack/react-query';

import type { Venue } from '@/types/api';
import { venuesApi } from '../api/venues.api';

export const venueKeys = { all: ['venues'] as const };

/** Backed by a mock service today; the hook will not change when E4 lands. */
export function useVenues() {
  return useQuery<Venue[]>({
    queryKey: venueKeys.all,
    queryFn: venuesApi.list,
  });
}
