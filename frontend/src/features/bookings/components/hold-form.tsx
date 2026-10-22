import axios from 'axios';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { Field, Select } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/states';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { todayInVenueTime } from '@/lib/calendar';
import { FULL_DAY_TIME_SLOTS } from '@/lib/date-time';
import { formatDateRange } from '@/lib/utils';
import type { BookingConflictErrorBody, BookingRequestResult, CalendarView } from '@/types/api';
import { useHoldableEvents, useHolds } from '../hooks/use-bookings';
import { END_BEFORE_START, holdProblems } from '../holds';
import { ConflictList } from './conflict-list';

/**
 * US-54 AC-1/AC-2 — Venue Staff hold a free slot for an event until an
 * expiry. The expiry must be in the future and before both the event and the
 * held time start; checked here as the user picks, and again by the server.
 * A clash with an approved booking, another live hold or a block comes back
 * as 409 and is listed; overlapping pending requests are only a warning.
 */
export function HoldForm({ venues, onDone }: { venues: CalendarView['venues']; onDone: () => void }) {
  const { place } = useHolds();
  const [venueId, setVenueId] = useState(venues.length === 1 ? venues[0].id : '');
  const [eventId, setEventId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [result, setResult] = useState<BookingRequestResult | null>(null);
  const events = useHoldableEvents(venueId);

  const today = todayInVenueTime();
  const event = events.data?.find((e) => e.id === eventId);
  const errors = fieldErrors(place.error, HOLD_FIELDS);
  const conflicts =
    axios.isAxiosError<BookingConflictErrorBody>(place.error) && place.error.response?.status === 409
      ? (place.error.response.data.conflicts ?? [])
      : [];

  const problems = holdProblems({ start, end, expiresAt, eventStart: event?.proposedStart ?? null });
  const complete = Boolean(venueId && eventId && start && end && expiresAt) && problems.length === 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    place.mutate(
      { venueId, payload: { eventId, start: toIso(start), end: toIso(end), expiresAt: toIso(expiresAt) } },
      {
        onSuccess: (created) => (created.warnings.length > 0 ? setResult(created) : onDone()),
      },
    );
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Hold placed. These pending requests overlap it and can no longer be approved as they stand:</p>
            <ConflictList conflicts={result.warnings.flatMap((w) => w.conflicts)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Venue" htmlFor="hold-venue" required errors={errors.byField.venueId}>
          <Select
            id="hold-venue"
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value);
              setEventId('');
            }}
          >
            <option value="">Select a venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Event"
          htmlFor="hold-event"
          required
          errors={errors.byField.eventId}
          hint={event?.proposedStart && event.proposedEnd ? `Runs ${formatDateRange(event.proposedStart, event.proposedEnd)}` : undefined}
        >
          <Select
            id="hold-event"
            value={eventId}
            disabled={!venueId || events.isPending}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">{events.isPending && venueId ? 'Loading events…' : 'Select an event'}</option>
            {(events.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name ?? 'Untitled event'}
                {e.coordinator ? ` — ${e.coordinator.name}` : ' — unassigned'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="hold-start" required errors={errors.byField.start}>
          <DateTimeField id="hold-start" label="From" value={start} onChange={setStart} slots={FULL_DAY_TIME_SLOTS} min={today} />
        </Field>
        <Field
          label="Until"
          htmlFor="hold-end"
          required
          errors={problems.includes(END_BEFORE_START) ? [END_BEFORE_START] : errors.byField.end}
        >
          <DateTimeField
            id="hold-end"
            label="Until"
            value={end}
            onChange={setEnd}
            slots={FULL_DAY_TIME_SLOTS}
            min={start.slice(0, 10) || today}
            invalid={problems.includes(END_BEFORE_START)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Hold expires"
            htmlFor="hold-expires"
            required
            hint="If it is not confirmed by then, the hold is released and the slot becomes available."
            errors={
              problems.filter((p) => p !== END_BEFORE_START).length > 0
                ? problems.filter((p) => p !== END_BEFORE_START)
                : errors.byField.expiresAt
            }
          >
            <DateTimeField
              id="hold-expires"
              label="Hold expires"
              value={expiresAt}
              onChange={setExpiresAt}
              slots={FULL_DAY_TIME_SLOTS}
              min={today}
              invalid={problems.some((p) => p !== END_BEFORE_START)}
            />
          </Field>
        </div>
      </div>

      {conflicts.length > 0 ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">This time is already taken:</p>
          <ConflictList conflicts={conflicts} />
        </div>
      ) : null}
      {errors.general.length > 0 && conflicts.length === 0 ? <ErrorState message={errors.general.join(' ')} /> : null}
      {place.error && conflicts.length === 0 && !errors.general.length && !Object.keys(errors.byField).length ? (
        <ErrorState message={apiErrorMessage(place.error, 'Could not place this hold.')} />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!complete || place.isPending}>
          {place.isPending ? 'Placing…' : 'Place hold'}
        </Button>
      </div>
    </form>
  );
}

/** "yyyy-mm-ddThh:mm" (a datetime-local value) -> ISO, or '' if incomplete. */
function toIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

const HOLD_FIELDS = ['venueId', 'eventId', 'start', 'end', 'expiresAt'] as const;
