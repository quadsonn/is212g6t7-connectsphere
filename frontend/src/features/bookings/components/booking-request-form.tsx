import axios from 'axios';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Select } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState } from '@/components/ui/states';
import { useVenues } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { todayInVenueTime } from '@/lib/calendar';
import { START_TIME_SLOTS, TIME_SLOTS, slotsIncluding } from '@/lib/date-time';
import { formatDateRange, humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  type BookingConflictErrorBody,
  type BookingRequestResult,
  type CoordinatorRequestView,
} from '@/types/api';
import { useCreateBookingRequest } from '../hooks/use-bookings';
import { ConflictList } from './conflict-list';

const FIELDS = ['venueId', 'start', 'end', 'expectedAttendance'] as const;

/** ISO -> "yyyy-mm-dd" in local time, for a date input. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO -> "HH:mm" in local time, for a time input. */
function toTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Local date + time -> ISO, or '' when either half is missing. */
function toIso(date: string, time: string): string {
  if (!date || !time) return '';
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

/**
 * US-21 — a Coordinator requests a venue for one of their events.
 *
 * Pre-filled from the event's proposed dates and attendance. The event's
 * requirements are shown read-only: the server copies them onto the request
 * (AC-2), so what is displayed here is exactly what Venue Staff will see.
 */
export function BookingRequestForm({ event }: { event: CoordinatorRequestView }) {
  const { data: venues, isPending: venuesLoading } = useVenues({ sortBy: 'name' });
  const create = useCreateBookingRequest();

  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState(toDateInput(event.proposedStart));
  const [startTime, setStartTime] = useState(toTimeInput(event.proposedStart));
  const [endTime, setEndTime] = useState(toTimeInput(event.proposedEnd));
  const [attendance, setAttendance] = useState(
    event.expectedAttendance ? String(event.expectedAttendance) : '',
  );
  const [submitted, setSubmitted] = useState<BookingRequestResult | null>(null);

  // AC-1: every field is required before the form can be sent.
  const complete = Boolean(venueId && date && startTime && endTime && Number(attendance) > 0);

  const errors = fieldErrors(create.error, FIELDS);
  const conflicts =
    axios.isAxiosError<BookingConflictErrorBody>(create.error) &&
    create.error.response?.status === 409
      ? (create.error.response.data.conflicts ?? [])
      : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setSubmitted(null);
    create.mutate(
      {
        eventId: event.id,
        venueId,
        start: toIso(date, startTime),
        end: toIso(date, endTime),
        expectedAttendance: Number(attendance),
      },
      { onSuccess: (result) => setSubmitted(result) },
    );
  }

  // AC-6: confirmation, with any AC-5 warning carried alongside.
  if (submitted) {
    return (
      <div className="space-y-3">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Booking request submitted — pending Venue Staff approval.</p>
            <p className="mt-1">
              {submitted.venue.name} · {formatDateRange(submitted.start, submitted.end)}
            </p>
          </div>
        </div>

        {submitted.warnings.map((warning) => (
          <div
            key={warning.code}
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">
                Another pending request overlaps this time. Venue Staff will decide between them.
              </p>
              <ConflictList conflicts={warning.conflicts} />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap justify-end gap-2">
          <LinkButton to="/coordinator/bookings" variant="secondary" size="sm">
            View my venue requests
          </LinkButton>
          <Button type="button" size="sm" onClick={() => setSubmitted(null)}>
            Request another venue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Venue" htmlFor="booking-venue" required errors={errors.byField.venueId}>
        <Select
          id="booking-venue"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          disabled={venuesLoading}
        >
          <option value="">{venuesLoading ? 'Loading venues…' : 'Select a venue'}</option>
          {venues?.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
              {venue.capacity ? ` (capacity ${venue.capacity})` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Event date" htmlFor="booking-date" required errors={errors.byField.start}>
          {/* The platform's themed calendar; a venue cannot be booked in the past. */}
          <DatePicker
            id="booking-date"
            label="Event date"
            placeholder="Select a date"
            value={date}
            onChange={setDate}
            min={todayInVenueTime()}
            invalid={(errors.byField.start?.length ?? 0) > 0}
          />
        </Field>
        <Field label="Start time" htmlFor="booking-start" required>
          <Select id="booking-start" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            <option value="">Select a time</option>
            {slotsIncluding(START_TIME_SLOTS, startTime).map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="End time" htmlFor="booking-end" required errors={errors.byField.end}>
          <Select
            id="booking-end"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            aria-invalid={(errors.byField.end?.length ?? 0) > 0}
          >
            <option value="">Select a time</option>
            {slotsIncluding(TIME_SLOTS, endTime).map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Expected attendance"
        htmlFor="booking-attendance"
        required
        errors={errors.byField.expectedAttendance}
      >
        <Input
          id="booking-attendance"
          type="number"
          min={1}
          step={1}
          value={attendance}
          onChange={(e) => setAttendance(e.target.value)}
        />
      </Field>

      {/* AC-2: what will be attached, shown so nothing is a surprise. */}
      <div className="rounded-lg bg-ink-50 px-4 py-3 text-sm">
        <p className="font-medium text-ink-800">Requirements attached to this request</p>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-ink-700 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-500">Layout</dt>
            <dd>
              {event.preferredLayout ? humanise(event.preferredLayout) : 'No preference'}
              {event.layoutNotes ? ` — ${event.layoutNotes}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Equipment / technical</dt>
            <dd>{event.equipmentNeeds ?? 'None recorded'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-500">Accessibility</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {event.accessibilityRequirements.length > 0
                ? event.accessibilityRequirements.map((feature) => (
                    <Badge key={feature} className="bg-white text-ink-700 ring-ink-300">
                      {ACCESSIBILITY_FEATURE_LABELS[feature]}
                    </Badge>
                  ))
                : 'None recorded'}
              {event.accessibilityNotes ? (
                <span className="w-full">{event.accessibilityNotes}</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      {/* AC-4: blocked, and why. */}
      {conflicts.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-medium">
            This venue is already confirmed or blocked out for part of that time. Choose another time
            or venue.
          </p>
          <ConflictList conflicts={conflicts} />
        </div>
      ) : create.error && errors.general.length === 0 && !Object.keys(errors.byField).length ? (
        <ErrorState message={apiErrorMessage(create.error, 'Could not submit this request.')} />
      ) : errors.general.length > 0 ? (
        <ErrorState message={errors.general.join(' ')} />
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!complete || create.isPending}>
          {create.isPending ? 'Submitting…' : 'Submit booking request'}
        </Button>
      </div>
    </form>
  );
}
