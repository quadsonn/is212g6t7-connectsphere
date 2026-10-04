import { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  ACCESSIBILITY_FEATURES,
  FACILITIES,
  FACILITY_LABELS,
  type AccessibilityFeature,
  type Facility,
} from '@/types/api';
import type { VenueSearchFilters } from '../search-filters';

/**
 * Shorter wording for the filter chips only; every other screen keeps the
 * full labels from types/api.ts.
 */
const ACCESSIBILITY_CHIP_LABELS: Record<AccessibilityFeature, string> = {
  ...ACCESSIBILITY_FEATURE_LABELS,
  WHEELCHAIR_ACCESSIBLE_LIFT: 'Wheelchair lift',
  ACCESSIBLE_PARKING: 'Accessible parking',
  ACCESSIBLE_RESTROOMS: 'Accessible restrooms',
  WHEELCHAIR_SEATING: 'Wheelchair seating',
};

/** Shown before "Show more": the requirements Coordinators ask for most. */
const COMMON_ACCESSIBILITY: AccessibilityFeature[] = [
  'STEP_FREE_ACCESS',
  'WHEELCHAIR_ACCESSIBLE_LIFT',
  'ACCESSIBLE_RESTROOMS',
  'HEARING_LOOP',
  'NURSING_ROOM',
];
const COMMON_FACILITIES: Facility[] = [
  'PROJECTOR',
  'SOUND_SYSTEM',
  'WIFI',
  'WHITEBOARD',
  'CATERING_KITCHEN',
];

/**
 * US-18 — the venue search filters. Rendered in AppShell's sidebar on wide
 * screens and inline on narrow ones; the page owns the state either way.
 *
 * The form's id is shared with the name search above the results, which
 * submits it via the `form` attribute.
 */
export function VenueFilterPanel({
  filters,
  onChange,
  onSubmit,
  onClear,
  error,
}: {
  filters: VenueSearchFilters;
  onChange: <K extends keyof VenueSearchFilters>(
    key: K,
    value: VenueSearchFilters[K],
  ) => void;
  onSubmit: () => void;
  onClear: () => void;
  error: string | null;
}) {
  return (
    <form
      id="venue-search-form"
      aria-labelledby="venue-filters-heading"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="mt-5 border-t border-ink-200 pt-5">
        <h2
          id="venue-filters-heading"
          className="mb-5 flex items-center gap-2 px-1 text-sm font-semibold text-ink-900"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters
        </h2>

        <div className="space-y-6 px-1">
          <div role="group" aria-labelledby="filter-availability">
            <SectionHeading id="filter-availability" aside="Singapore time">
              Availability
            </SectionHeading>
            <Input
              type="date"
              aria-label="Date"
              value={filters.date}
              onChange={(e) => onChange('date', e.target.value)}
            />
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <label
                  htmlFor="filter-from"
                  className="mb-1 block text-xs text-ink-500"
                >
                  From
                </label>
                <Input
                  id="filter-from"
                  type="time"
                  value={filters.startTime}
                  onChange={(e) => onChange('startTime', e.target.value)}
                />
              </div>
              <span className="pb-2.5 text-ink-400" aria-hidden="true">
                –
              </span>
              <div>
                <label
                  htmlFor="filter-to"
                  className="mb-1 block text-xs text-ink-500"
                >
                  To
                </label>
                <Input
                  id="filter-to"
                  type="time"
                  value={filters.endTime}
                  onChange={(e) => onChange('endTime', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <SectionHeading htmlFor="filter-capacity">
              Minimum capacity
            </SectionHeading>
            <div className="relative">
              <Input
                id="filter-capacity"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Number of attendees"
                value={filters.minCapacity}
                onChange={(e) => onChange('minCapacity', e.target.value)}
                className="pr-14"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                seats
              </span>
            </div>
          </div>

          <div>
            <SectionHeading>Accessibility</SectionHeading>
            <CollapsibleChips
              label="Accessibility — venue must have all selected"
              options={ACCESSIBILITY_FEATURES}
              common={COMMON_ACCESSIBILITY}
              labels={ACCESSIBILITY_CHIP_LABELS}
              values={filters.accessibility}
              onChange={(next) => onChange('accessibility', next)}
            />
          </div>

          <div>
            <SectionHeading>Facilities</SectionHeading>
            <CollapsibleChips
              label="Facilities — venue must have all selected"
              options={FACILITIES}
              common={COMMON_FACILITIES}
              labels={FACILITY_LABELS}
              values={filters.facilities}
              onChange={(next) => onChange('facilities', next)}
            />
          </div>

          {error ? <ErrorState message={error} /> : null}
        </div>

        {/* Sticky, so Apply stays reachable while the sidebar scrolls. */}
        <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-ink-200 bg-ink-50 px-1 py-4">
          <Button type="submit" className="flex-1">
            Apply filters
          </Button>
          <button
            type="button"
            onClick={onClear}
            className="px-1 text-sm text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
          >
            Clear all
          </button>
        </div>
      </div>
    </form>
  );
}

function SectionHeading({
  children,
  aside,
  htmlFor,
  id,
}: {
  children: React.ReactNode;
  aside?: string;
  htmlFor?: string;
  id?: string;
}) {
  const className =
    'text-xs font-semibold uppercase tracking-wide text-ink-500';

  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
          {children}
        </label>
      ) : (
        <h3 id={id} className={className}>
          {children}
        </h3>
      )}
      {aside ? <span className="text-xs text-ink-400">{aside}</span> : null}
    </div>
  );
}

/**
 * ChipGroup showing only the common options until expanded. A selected chip
 * stays visible even when collapsed, so a choice is never hidden.
 */
function CollapsibleChips<T extends string>({
  label,
  options,
  common,
  labels,
  values,
  onChange,
}: {
  label: string;
  options: readonly T[];
  common: readonly T[];
  labels: Record<T, string>;
  values: readonly T[];
  onChange: (next: T[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? options
    : options.filter(
        (option) => common.includes(option) || values.includes(option),
      );
  const hiddenCount = options.length - visible.length;

  return (
    <>
      <ChipGroup
        label={label}
        options={visible}
        labels={labels}
        values={values}
        // Selected chips are always visible, so `next` is the whole selection;
        // re-sort it into full-vocabulary order.
        onChange={(next) => onChange(options.filter((o) => next.includes(o)))}
      />
      {expanded || hiddenCount > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </>
  );
}
