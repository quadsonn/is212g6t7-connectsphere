import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api-client';
import type { AlternativeCandidate } from '@/types/api';
import { useBookingAlternatives } from '../hooks/use-bookings';
import { noSuitableVenueMessage } from '../lib/capacity';

function describe(candidate: AlternativeCandidate): string {
  const parts = [
    candidate.location,
    candidate.capacity !== null ? `seats ${candidate.capacity}` : null,
    candidate.spareCapacity !== null ? `${candidate.spareCapacity} spare` : null,
    candidate.layout === 'MET'
      ? 'supports the requested layout'
      : candidate.layout === 'UNMET'
        ? 'does not support the requested layout'
        : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * US-41 — the alternatives Venue Staff attach to a rejection.
 *
 * AC-2: the system's candidates, best match first — free for the requested
 * time and meeting its capacity and accessibility needs. AC-3: or another
 * venue chosen by hand — only from those the server reports as free and big
 * enough (Capacity AC-3). Capacity AC-4: when there are none, it says so.
 * The server re-checks every venue sent: one that is not free or too small
 * refuses the rejection with a reason, shown by the caller.
 */
export function AlternativeVenuesPicker({
  bookingId,
  selected,
  onChange,
}: {
  bookingId: string;
  selected: string[];
  onChange: (venueIds: string[]) => void;
}) {
  const alternatives = useBookingAlternatives(bookingId, true);
  const [manual, setManual] = useState('');

  const candidates = alternatives.data?.candidates ?? [];
  const others = alternatives.data?.others ?? [];
  const candidateIds = new Set(candidates.map((c) => c.venueId));
  const names = new Map<string, string>(
    [...candidates, ...others].map((v) => [v.venueId, v.name ?? 'Unnamed venue'] as const),
  );

  // AC-3: the free, big-enough venues not already picked or proposed.
  const manualOptions = others.filter((v) => !selected.includes(v.venueId));
  const manualPicks = selected.filter((id) => !candidateIds.has(id));
  // Capacity AC-4: nothing at all can be suggested.
  const noneSuitable = alternatives.isSuccess && candidates.length === 0 && others.length === 0;

  const toggle = (venueId: string) =>
    onChange(
      selected.includes(venueId) ? selected.filter((id) => id !== venueId) : [...selected, venueId],
    );

  return (
    <fieldset className="space-y-3 rounded-lg border border-ink-200 p-4">
      <legend className="px-1 text-sm font-medium text-ink-800">
        Suggest alternative venues (optional)
      </legend>

      <div aria-live="polite">
        {alternatives.isPending ? (
          <p className="text-sm text-ink-500">Finding venues free for this time…</p>
        ) : alternatives.isError ? (
          <p className="text-sm text-red-700">
            {apiErrorMessage(alternatives.error, 'Could not load suggested venues.')}
          </p>
        ) : noneSuitable ? (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {noSuitableVenueMessage(alternatives.data.expectedAttendance)}
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-ink-600">
            No venue is free for this time and meets every requirement. You can still choose one
            below that is free and big enough.
          </p>
        ) : (
          <>
            <p className="text-xs text-ink-500">
              Free for the requested time and meeting its capacity and accessibility needs, best
              match first.
            </p>
            <ul className="mt-2 space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.venueId}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.includes(candidate.venueId)}
                      onChange={() => toggle(candidate.venueId)}
                    />
                    <span>
                      <span className="font-medium text-ink-900">
                        {candidate.name ?? 'Unnamed venue'}
                      </span>
                      <span className="block text-xs text-ink-600">{describe(candidate)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {noneSuitable ? null : (
      <div className="space-y-2">
        <label htmlFor={`manual-venue-${bookingId}`} className="block text-sm text-ink-800">
          Or choose another venue
        </label>
        <div className="flex flex-wrap gap-2">
          <select
            id={`manual-venue-${bookingId}`}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className="h-10 min-w-48 flex-1 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900"
          >
            <option value="">Select a venue…</option>
            {manualOptions.map((v) => (
              <option key={v.venueId} value={v.venueId}>
                {v.name ?? 'Unnamed venue'}
                {v.capacity !== null ? ` (seats ${v.capacity})` : ''}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!manual}
            onClick={() => {
              onChange([...selected, manual]);
              setManual('');
            }}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-ink-500">
          Only venues free for the requested time and big enough for its attendance are listed.
        </p>
        {manualPicks.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Venues chosen manually">
            {manualPicks.map((id) => (
              <li
                key={id}
                className="flex items-center gap-1 rounded-full bg-ink-100 py-1 pl-3 pr-1 text-xs text-ink-800"
              >
                {names.get(id) ?? 'Venue'}
                <button
                  type="button"
                  className="rounded-full px-1.5 text-ink-500 hover:bg-ink-200"
                  aria-label={`Remove ${names.get(id) ?? 'venue'}`}
                  onClick={() => toggle(id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      )}
    </fieldset>
  );
}
