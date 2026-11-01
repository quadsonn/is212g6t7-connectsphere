import axios from 'axios';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { AttendanceSelect } from '@/components/attendance-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState } from '@/components/ui/states';
import { useVenues } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { todayInVenueTime } from '@/lib/calendar';
import {
  START_TIME_SLOTS,
  TIME_SLOTS,
  isoToLocalParts,
  partsToInstant,
  slotsIncluding,
} from '@/lib/date-time';
import { formatDateRange, humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  ACCESSIBILITY_FEATURES,
  ROOM_LAYOUTS,
  type AccessibilityFeature,
  type BookingConflictErrorBody,
  type RoomLayout,
  type BookingRequestResult,
  type CoordinatorRequestView,
  type VenueBooking,
} from '@/types/api';
import { useCreateBookingRequest } from '../hooks/use-bookings';
import { capacityShortfallMessage } from '../lib/capacity';
import { ConflictList } from './conflict-list';

const FIELDS = ['venueId', 'start', 'end', 'expectedAttendance'] as const;

/** ISO -> "yyyy-mm-dd" at the venue (Singapore), for a date input. */
function toDateInput(iso: string | null): string {
  return isoToLocalParts(iso).date;
}

/** ISO -> "HH:mm" at the venue (Singapore), for a time input. */
function toTimeInput(iso: string | null): string {
  return isoToLocalParts(iso).time;
}

/** Singapore date + time -> ISO, or '' when either half is missing. */
function toIso(date: string, time: string): string {
  return partsToInstant(date, time);
}

/**
 * US-21 — a Coordinator requests a venue for one of their events.
 *
 * Pre-filled from the event's proposed dates and attendance. The event's
 * requirements are shown read-only: the server copies them onto the request
 * (AC-2), so what is displayed here is exactly what Venue Staff will see.
 *
 * US-52 AC-3: given `replacing` — a booking whose venue became unavailable —
 * it requests a replacement instead: pre-filled from that booking's timing
 * and attendance (still editable), carrying that booking's requirements, and
 * linked to it so that approving the replacement releases it.
 *
 * US-53 AC-2: an event can hold several venues, each needing its own
 * requirements (a hall in theatre layout, a breakout room as a classroom), so
 * they can be set for this venue instead of copied.
 */
export function BookingRequestForm({
  event,
  replacing,
  initialVenueId = '',
}: {
  event: CoordinatorRequestView;
  replacing?: VenueBooking;
  /** A venue already chosen, e.g. from "Request this venue" on its page. */
  initialVenueId?: string;
}) {
  const { data: venues, isPending: venuesLoading } = useVenues({ sortBy: 'name' });
  const create = useCreateBookingRequest();

  const [venueId, setVenueId] = useState(initialVenueId);
  const initialStart = replacing?.start ?? event.proposedStart;
  const initialEnd = replacing?.end ?? event.proposedEnd;
  const initialAttendance = replacing?.expectedAttendance ?? event.expectedAttendance;
  const [date, setDate] = useState(toDateInput(initialStart));
  const [startTime, setStartTime] = useState(toTimeInput(initialStart));
  const [endTime, setEndTime] = useState(toTimeInput(initialEnd));
  const [attendance, setAttendance] = useState(
    initialAttendance ? String(initialAttendance) : '',
  );
  // What the server copies onto the request: the replaced booking's
  // requirements for a replacement (US-52), the event's otherwise (AC-2).
  const requirements = replacing ?? event;

  // US-53 AC-2: this venue's own requirements, starting from the copied ones.
  const [ownRequirements, setOwnRequirements] = useState(false);
  const [layout, setLayout] = useState<RoomLayout | ''>(requirements.preferredLayout ?? '');
  const [layoutNotes, setLayoutNotes] = useState(requirements.layoutNotes ?? '');
  const [accessibility, setAccessibility] = useState<AccessibilityFeature[]>(
    requirements.accessibilityRequirements,
  );
  const [accessibilityNotes, setAccessibilityNotes] = useState(requirements.accessibilityNotes ?? '');
  const [equipmentNeeds, setEquipmentNeeds] = useState(requirements.equipmentNeeds ?? '');
  const [submitted, setSubmitted] = useState<BookingRequestResult | null>(null);

  // AC-1: every field is required before the form can be sent.
  const complete = Boolean(venueId && date && startTime && endTime && Number(attendance) > 0);

  // Capacity AC-1/AC-2: a venue too small for the attendance can't be
  // requested — explained here before sending; the server refuses it anyway.
  const selectedVenue = venues?.find((venue) => venue.id === venueId);
  const shortfall =
    selectedVenue && Number(attendance) > 0
      ? capacityShortfallMessage(selectedVenue, Number(attendance))
      : null;

  const errors = fieldErrors(create.error, FIELDS);
  const conflicts =
    axios.isAxiosError<BookingConflictErrorBody>(create.error) &&
    create.error.response?.status === 409
      ? (create.error.response.data.conflicts ?? [])
      : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || shortfall) return;
    setSubmitted(null);
    create.mutate(
      {
        eventId: event.id,
        venueId,
        start: toIso(date, startTime),
        end: toIso(date, endTime),
        expectedAttendance: Number(attendance),
        ...(replacing ? { replacesBookingId: replacing.id } : {}),
        ...(ownRequirements
          ? {
              preferredLayout: layout || null,
              layoutNotes: layoutNotes.trim() || null,
              accessibilityRequirements: accessibility,
              accessibilityNotes: accessibilityNotes.trim() || null,
              equipmentNeeds: equipmentNeeds.trim() || null,
            }
          : {}),
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
            <p className="font-medium">
              {replacing
                ? 'Replacement request submitted — pending Venue Staff approval. The original booking is released once it is approved.'
                : 'Booking request submitted — pending Venue Staff approval.'}
            </p>
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
              {venue.id === replacing?.venueId ? '(unavailable) ' : ''}
              {venue.name}
              {venue.capacity ? ` (capacity ${venue.capacity})` : ''}
            </option>
          ))}
        </Select>
        {replacing ? (
          <p className="text-xs text-ink-500">
            Not sure which venue?{' '}
            <a href="/coordinator/venues" target="_blank" rel="noreferrer" className="underline">
              Search venues
            </a>{' '}
            by capacity, facilities and date, then choose it here.
          </p>
        ) : null}
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
        <AttendanceSelect
          id="booking-attendance"
          value={attendance}
          onChange={setAttendance}
          aria-invalid={shortfall ? true : undefined}
          aria-describedby={shortfall ? 'booking-capacity-error' : undefined}
        />
      </Field>
      {shortfall ? (
        <p
          id="booking-capacity-error"
          role="alert"
          className="-mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {shortfall} Choose a larger venue or lower the expected attendance.
        </p>
      ) : null}

      {/* AC-2: what will be attached, shown so nothing is a surprise. */}
      {ownRequirements ? (
        // US-53 AC-2: this venue's own requirements.
        <fieldset className="space-y-3 rounded-lg border border-ink-200 px-4 py-3">
          <legend className="px-1 text-sm font-medium text-ink-800">
            Requirements for this venue
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Layout" htmlFor="booking-layout">
              <Select
                id="booking-layout"
                value={layout}
                onChange={(e) => setLayout(e.target.value as RoomLayout | '')}
              >
                <option value="">No preference</option>
                {ROOM_LAYOUTS.map((value) => (
                  <option key={value} value={value}>
                    {humanise(value)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Layout notes" htmlFor="booking-layout-notes">
              <Input
                id="booking-layout-notes"
                value={layoutNotes}
                onChange={(e) => setLayoutNotes(e.target.value)}
              />
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink-800">Accessibility</legend>
            <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {ACCESSIBILITY_FEATURES.map((feature) => (
                <label key={feature} className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={accessibility.includes(feature)}
                    onChange={() =>
                      setAccessibility((current) =>
                        current.includes(feature)
                          ? current.filter((f) => f !== feature)
                          : [...current, feature],
                      )
                    }
                  />
                  {ACCESSIBILITY_FEATURE_LABELS[feature]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Accessibility notes" htmlFor="booking-accessibility-notes">
            <Input
              id="booking-accessibility-notes"
              value={accessibilityNotes}
              onChange={(e) => setAccessibilityNotes(e.target.value)}
            />
          </Field>
          <Field label="Equipment / technical" htmlFor="booking-equipment">
            <Textarea
              id="booking-equipment"
              rows={2}
              value={equipmentNeeds}
              onChange={(e) => setEquipmentNeeds(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={() => setOwnRequirements(false)}>
              Use the {replacing ? "original booking's" : "event's"} requirements
            </Button>
          </div>
        </fieldset>
      ) : (
        <div className="rounded-lg bg-ink-50 px-4 py-3 text-sm">
          <p className="font-medium text-ink-800">Requirements attached to this request</p>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-ink-700 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-500">Layout</dt>
              <dd>
                {requirements.preferredLayout ? humanise(requirements.preferredLayout) : 'No preference'}
                {requirements.layoutNotes ? ` — ${requirements.layoutNotes}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Equipment / technical</dt>
              <dd>{requirements.equipmentNeeds ?? 'None recorded'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-500">Accessibility</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {requirements.accessibilityRequirements.length > 0
                  ? requirements.accessibilityRequirements.map((feature) => (
                      <Badge key={feature} className="bg-white text-ink-700 ring-ink-300">
                        {ACCESSIBILITY_FEATURE_LABELS[feature]}
                      </Badge>
                    ))
                  : 'None recorded'}
                {requirements.accessibilityNotes ? (
                  <span className="w-full">{requirements.accessibilityNotes}</span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>
      )}
      {!ownRequirements ? (
        <div className="-mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOwnRequirements(true)}>
            Set different requirements for this venue
          </Button>
        </div>
      ) : null}

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
        <Button type="submit" size="sm" disabled={!complete || Boolean(shortfall) || create.isPending}>
          {create.isPending
            ? 'Submitting…'
            : replacing
              ? 'Submit replacement request'
              : 'Submit booking request'}
        </Button>
      </div>
    </form>
  );
}
