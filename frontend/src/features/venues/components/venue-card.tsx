import { Building2, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { VenueSearchFilters } from '@/features/venues/search-filters';
import { cn } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  FACILITY_LABELS,
  type Venue,
} from '@/types/api';

/** Tags shown per card before collapsing the rest into "+N". */
export const MAX_CARD_TAGS = 3;

/**
 * One search result as a card. The whole card links to the venue's detail
 * page (US-17/US-20). Tags the venue matched on come first and are emphasised.
 */
export function VenueCard({
  venue,
  applied,
}: {
  venue: Venue;
  applied: VenueSearchFilters;
}) {
  const tags = [
    ...venue.accessibilityFeatures.map((f) => ({
      key: f,
      label: ACCESSIBILITY_FEATURE_LABELS[f],
      matched: applied.accessibility.includes(f),
    })),
    ...venue.facilities.map((f) => ({
      key: f,
      label: FACILITY_LABELS[f],
      matched: applied.facilities.includes(f),
    })),
  ].sort((a, b) => Number(b.matched) - Number(a.matched));
  const shown = tags.slice(0, MAX_CARD_TAGS);
  const hidden = tags.length - shown.length;

  return (
    <li>
      <Link
        to={`/coordinator/venues/${venue.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-ink-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {venue.imageUrls[0] ? (
          <img
            src={venue.imageUrls[0]}
            alt=""
            loading="lazy"
            className="aspect-[16/10] w-full bg-ink-100 object-cover"
          />
        ) : (
          <div
            className="flex aspect-[16/10] w-full items-center justify-center bg-brand-50 text-brand-300"
            aria-hidden="true"
          >
            <Building2 className="size-10" />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="line-clamp-2 font-semibold text-ink-900 group-hover:text-brand-700">
            {venue.name}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-ink-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{venue.location}</span>
          </p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
            {venue.capacity} seats
          </p>

          {shown.length > 0 ? (
            <div className="mt-auto flex flex-wrap gap-1 pt-2">
              {shown.map((tag) => (
                <span
                  key={tag.key}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    tag.matched
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {tag.matched ? (
                    <span className="sr-only">Matches filter: </span>
                  ) : null}
                  {tag.label}
                </span>
              ))}
              {hidden > 0 ? (
                <span className="px-1 py-0.5 text-xs text-ink-400">
                  +{hidden}
                  <span className="sr-only"> more</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
