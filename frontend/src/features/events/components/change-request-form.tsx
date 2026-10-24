import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useEquipmentCatalogueOptions, useRequestChange } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { ATTENDANCE_BANDS, attendanceBandLabel } from '@/lib/attendance-bands';
import { todayInVenueTime } from '@/lib/calendar';
import {
  START_TIME_SLOTS,
  TIME_SLOTS,
  isoToLocalParts,
  partsToInstant,
  slotsIncluding,
} from '@/lib/date-time';
import type { ChangeRequestPayload, OrganiserRequestView } from '@/types/api';

interface Row {
  key: number;
  equipmentId: string;
  quantity: string;
}

let nextKey = 0;

/** Same set comparison the server uses: order does not matter. */
function sameLines(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  const quantities = new Map(a.map((row) => [row.equipmentId, Number(row.quantity)]));
  return b.every((row) => quantities.get(row.equipmentId) === Number(row.quantity));
}

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0;

/**
 * US-37 — the Organiser's change request form.
 *
 * Starts from the event's current date, time, attendance and equipment, and
 * sends only what the Organiser actually changed. The server re-checks every
 * rule; the checks here are so the Organiser sees a problem beside the field
 * instead of after a round trip.
 */
export function ChangeRequestForm({
  event,
  onDone,
  onCancel,
}: {
  event: OrganiserRequestView;
  onDone: () => void;
  onCancel: () => void;
}) {
  const start = isoToLocalParts(event.proposedStart);
  const end = isoToLocalParts(event.proposedEnd);

  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [attendance, setAttendance] = useState(
    event.expectedAttendance == null ? '' : String(event.expectedAttendance),
  );

  // Only lines linked to the catalogue can be edited; the rest are shown as-is.
  const [initialLines] = useState<Row[]>(() =>
    (event.equipmentRequirements ?? [])
      .filter((r) => r.equipmentId)
      .map((r) => ({
        key: nextKey++,
        equipmentId: r.equipmentId as string,
        quantity: String(r.quantity),
      })),
  );
  const legacyLines = (event.equipmentRequirements ?? []).filter((r) => !r.equipmentId);

  const [rows, setRows] = useState<Row[]>(initialLines);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const catalogue = useEquipmentCatalogueOptions();
  const request = useRequestChange(event.id);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // The typed date/time is read as Singapore time, like every entry form.
  const startIso = partsToInstant(startDate, startTime) || null;
  const endIso = partsToInstant(endDate, endTime) || null;
  const currentStart = event.proposedStart ? new Date(event.proposedStart).getTime() : null;
  const currentEnd = event.proposedEnd ? new Date(event.proposedEnd).getTime() : null;

  const startChanged = startIso !== null && new Date(startIso).getTime() !== currentStart;
  const endChanged = endIso !== null && new Date(endIso).getTime() !== currentEnd;
  const attendanceChanged =
    attendance.trim() !== '' && Number(attendance) !== event.expectedAttendance;

  // Blank rows (item not chosen yet) are ignored, like the Coordinator's editor.
  const filledRows = rows.filter((row) => row.equipmentId !== '');
  const equipmentChanged = !sameLines(initialLines, filledRows);

  const now = new Date();
  const errors = {
    start: [] as string[],
    end: [] as string[],
    equipment: [] as string[],
    reason: [] as string[],
  };

  if (startChanged && startIso && new Date(startIso) <= now) errors.start.push('Start must be in the future.');
  if (endChanged && endIso && new Date(endIso) <= now) errors.end.push('End must be in the future.');
  if (startIso && endIso && new Date(endIso) <= new Date(startIso) && (startChanged || endChanged)) {
    errors.end.push('End time must be after the start time.');
  }
  const seen = new Set<string>();
  filledRows.forEach((row, index) => {
    if (!isWholeNumber(row.quantity)) {
      errors.equipment.push(`Row ${index + 1}: quantity must be a positive whole number.`);
    }
    if (seen.has(row.equipmentId)) {
      errors.equipment.push(`Row ${index + 1}: this item is already listed; combine the quantities.`);
    }
    seen.add(row.equipmentId);
  });

  if (reason.trim() === '') errors.reason.push('A reason is required.');

  const hasFieldErrors = Object.values(errors).some((list) => list.length > 0);
  const anyChange = startChanged || endChanged || attendanceChanged || equipmentChanged;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasFieldErrors || !anyChange) return;

    const payload: ChangeRequestPayload = { reason: reason.trim() };
    if (startChanged && startIso) payload.proposedStart = startIso;
    if (endChanged && endIso) payload.proposedEnd = endIso;
    if (attendanceChanged) payload.proposedAttendance = Number(attendance);
    if (equipmentChanged) {
      payload.equipment = filledRows.map((row) => ({
        equipmentId: row.equipmentId,
        quantity: Number(row.quantity),
      }));
    }

    request.mutate(payload, { onSuccess: onDone });
  }

  const show = (list: string[]) => (submitted ? list : undefined);
  const today = todayInVenueTime();

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <p className="text-sm text-ink-500">
        The fields below show what the event has now. Change what you need and say why — your
        event stays exactly as it is until the request is reviewed.
      </p>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Date and time</legend>

        <Field label="Start date" htmlFor="cr-start-date">
          <DatePicker label="Start date" value={startDate} onChange={setStartDate} min={today} />
        </Field>
        <Field label="Start time" htmlFor="cr-start-time" errors={show(errors.start)}>
          <Select
            id="cr-start-time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            aria-invalid={submitted && errors.start.length > 0}
          >
            {slotsIncluding(START_TIME_SLOTS, startTime).map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="End date" htmlFor="cr-end-date">
          <DatePicker label="End date" value={endDate} onChange={setEndDate} min={startDate || today} />
        </Field>
        <Field label="End time" htmlFor="cr-end-time" errors={show(errors.end)}>
          <Select
            id="cr-end-time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            aria-invalid={submitted && errors.end.length > 0}
          >
            {slotsIncluding(TIME_SLOTS, endTime).map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <Field
        label="Expected attendance"
        htmlFor="cr-attendance"
        hint="Used to match this event with a suitably sized venue."
      >
        <Select
          id="cr-attendance"
          value={attendance}
          onChange={(e) => setAttendance(e.target.value)}
        >
          {/* A stored value that is not one of the ranges (older data) is kept
              as an option, so the form never hides what the event has now. */}
          {attendance !== '' && !ATTENDANCE_BANDS.some((band) => band.value === attendance) ? (
            <option value={attendance}>{attendanceBandLabel(Number(attendance))}</option>
          ) : null}
          {attendance === '' ? <option value="">Select a range</option> : null}
          {ATTENDANCE_BANDS.map((band) => (
            <option key={band.value} value={band.value}>
              {band.label}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-800">Equipment</legend>

        {catalogue.isError ? (
          <p className="text-sm text-red-700">
            {apiErrorMessage(catalogue.error, 'Could not load the equipment catalogue.')}
          </p>
        ) : null}

        {rows.length === 0 ? <p className="text-sm text-ink-500">No equipment listed.</p> : null}

        {rows.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[1fr_6rem_auto] gap-2">
            <Select
              aria-label={`Equipment item, row ${index + 1}`}
              value={row.equipmentId}
              onChange={(e) => setRow(row.key, { equipmentId: e.target.value })}
              disabled={catalogue.isPending}
            >
              <option value="">Choose from the catalogue…</option>
              {(catalogue.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.type}
                  {item.location ? ` — ${item.location}` : ''}
                </option>
              ))}
            </Select>
            <Input
              aria-label={`Quantity, row ${index + 1}`}
              type="number"
              min={1}
              step={1}
              value={row.quantity}
              onChange={(e) => setRow(row.key, { quantity: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10"
              aria-label={`Remove row ${index + 1}`}
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setRows((prev) => [...prev, { key: nextKey++, equipmentId: '', quantity: '1' }])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Add item
        </Button>

        {legacyLines.length > 0 ? (
          <p className="text-xs text-ink-500">
            Also on this event, not from the catalogue (cannot be changed here):{' '}
            {legacyLines.map((r) => `${r.quantity} × ${r.equipmentType}`).join(', ')}.
          </p>
        ) : null}

        {submitted && errors.equipment.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-red-700">
            {errors.equipment.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </fieldset>

      <Field label="Reason for the change" htmlFor="cr-reason" required errors={show(errors.reason)}>
        <Textarea
          id="cr-reason"
          rows={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={submitted && errors.reason.length > 0}
        />
      </Field>

      {submitted && !anyChange ? (
        <p role="alert" className="text-sm text-red-700">
          Change at least one of the date, time, attendance or equipment.
        </p>
      ) : null}

      {request.error ? (
        <p role="alert" className="text-sm text-red-700">
          {apiErrorMessage(request.error, 'Could not submit this change request.')}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={request.isPending}>
          {request.isPending ? 'Submitting…' : 'Submit change request'}
        </Button>
      </div>
    </form>
  );
}
