import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimeField } from '@/components/ui/date-time-field';
import { CheckboxRow, Field, Select } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState } from '@/components/ui/states';
import { ConflictList } from '@/features/bookings/components/conflict-list';
import { NeedsReviewBadge } from '@/features/bookings/components/needs-review-badge';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { addDays, todayInVenueTime } from '@/lib/calendar';
import { FULL_DAY_TIME_SLOTS } from '@/lib/date-time';
import { cn, formatDateRange } from '@/lib/utils';
import type { CalendarEntry, CalendarView, VenueBlockResult } from '@/types/api';
import { ENTRY_STYLES, holdExpiryLabel } from '../calendar-utils';
import { useVenueBlocks } from '../hooks/use-calendar';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * AC-4 — what opens when a slot is clicked or tapped: the booking's event,
 * organiser, time and attendance, or a block's reason with a way to lift it.
 */
export function EntryDetail({
  entry,
  venueName,
  onClose,
}: {
  entry: CalendarEntry;
  venueName: string | null;
  onClose: () => void;
}) {
  const { remove } = useVenueBlocks();
  const [confirming, setConfirming] = useState(false);
  const style = ENTRY_STYLES[entry.kind];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className={cn('inline-block size-3 rounded-sm', style.className)} style={style.style} />
          <CardTitle>
            {entry.kind === 'BLOCKED' ? 'Blocked out' : (entry.eventName ?? 'Untitled event')}
          </CardTitle>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close details">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Status">
            {style.label}
            {holdExpiryLabel(entry) ? ` · ${holdExpiryLabel(entry)}` : ''}
            {entry.needsReview ? (
              <span className="mt-1 block">
                <NeedsReviewBadge />
              </span>
            ) : null}
          </Detail>
          <Detail label="Venue">{venueName ?? '—'}</Detail>
          <Detail label="Time">{formatDateRange(entry.start, entry.end)}</Detail>
          {entry.kind === 'BLOCKED' ? (
            <>
              <Detail label="Reason">{entry.reason}</Detail>
              <Detail label="Blocked by">{entry.createdByName ?? '—'}</Detail>
            </>
          ) : (
            <>
              <Detail label="Organiser">{entry.organiserName ?? '—'}</Detail>
              <Detail label="Expected attendance">{entry.expectedAttendance ?? '—'}</Detail>
              {entry.needsReview ? (
                <div className="sm:col-span-2">
                  <Detail label="Why it needs review">{entry.needsReviewReason ?? '—'}</Detail>
                </div>
              ) : null}
            </>
          )}
        </dl>

        {remove.error ? (
          <ErrorState message={apiErrorMessage(remove.error, 'Could not remove this block.')} />
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {entry.kind === 'BLOCKED' ? (
            confirming ? (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                  Keep block
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(entry.id, { onSuccess: onClose })}
                >
                  {remove.isPending ? 'Removing…' : 'Confirm remove'}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
                Remove block
              </Button>
            )
          ) : (
            <LinkButton to={`/venues/bookings/${entry.id}`} size="sm">
              {entry.kind === 'TENTATIVE' ? 'Open hold' : 'Open request'}
            </LinkButton>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** "yyyy-mm-ddThh:mm" (a datetime-local value) -> ISO, or '' if incomplete. */
function toIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

const BLOCK_FIELDS = ['venueId', 'start', 'end', 'reason'] as const;

/** AC-6 — mark a period on one of my venues as blocked. */
export function BlockForm({
  venues,
  onDone,
}: {
  venues: CalendarView['venues'];
  onDone: () => void;
}) {
  const { create } = useVenueBlocks();
  const [venueId, setVenueId] = useState(venues.length === 1 ? venues[0].id : '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  // "All day": whole days, midnight at the start of the first to midnight
  // after the last (e.g. a public holiday), picked as dates only.
  const [allDay, setAllDay] = useState(false);
  const [fromDay, setFromDay] = useState('');
  const [untilDay, setUntilDay] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<VenueBlockResult | null>(null);

  const blockStart = allDay ? (fromDay ? `${fromDay}T00:00` : '') : start;
  const blockEnd = allDay ? (untilDay ? `${addDays(untilDay, 1)}T00:00` : '') : end;

  const today = todayInVenueTime();
  const errors = fieldErrors(create.error, BLOCK_FIELDS);
  // Checked as the user types, so an end before the start is flagged at once
  // rather than after a round trip. The server enforces the same rule.
  const endBeforeStart = Boolean(
    blockStart && blockEnd && new Date(blockEnd) <= new Date(blockStart),
  );
  const complete = Boolean(venueId && blockStart && blockEnd && reason.trim()) && !endBeforeStart;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    create.mutate(
      { venueId, start: toIso(blockStart), end: toIso(blockEnd), reason: reason.trim() },
      {
        onSuccess: (created) => {
          if (created.overlappingBookings.length > 0) {
            // Keep the form open so the warning about existing bookings is seen.
            setResult(created);
          } else {
            onDone();
          }
        },
      },
    );
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              Time blocked out. These bookings already fall inside it and may need to be reviewed:
            </p>
            <ConflictList conflicts={result.overlappingBookings} />
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
        <Field label="Venue" htmlFor="block-venue" required errors={errors.byField.venueId}>
          <Select id="block-venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">Select a venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="block-reason" required errors={errors.byField.reason} hint="e.g. Maintenance, public holiday">
          <Input id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <div className="sm:col-span-2">
          <CheckboxRow
            id="block-all-day"
            label="All day (midnight to midnight)"
            checked={allDay}
            onChange={setAllDay}
          />
        </div>
        {/* Themed calendar; a block covers the whole day, so times run
            12:00 AM–11:30 PM rather than venue opening hours. */}
        <Field label="From" htmlFor="block-start" required errors={errors.byField.start}>
          {allDay ? (
            <DatePicker
              id="block-start"
              label="From"
              placeholder="Select a date"
              value={fromDay}
              onChange={setFromDay}
              min={today}
            />
          ) : (
            <DateTimeField
              id="block-start"
              label="From"
              value={start}
              onChange={setStart}
              slots={FULL_DAY_TIME_SLOTS}
              min={today}
            />
          )}
        </Field>
        <Field
          label="Until"
          htmlFor="block-end"
          required
          hint={allDay ? 'Blocked through the end of this day.' : undefined}
          errors={
            endBeforeStart
              ? ['The end must be after the start. Pick a later date or time.']
              : errors.byField.end
          }
        >
          {allDay ? (
            <DatePicker
              id="block-end"
              label="Until"
              placeholder="Select a date"
              value={untilDay}
              onChange={setUntilDay}
              min={fromDay || today}
              invalid={endBeforeStart}
              describedBy={endBeforeStart ? 'block-end-error' : undefined}
            />
          ) : (
            <DateTimeField
              id="block-end"
              label="Until"
              value={end}
              onChange={setEnd}
              slots={FULL_DAY_TIME_SLOTS}
              min={start.slice(0, 10) || today}
              invalid={endBeforeStart}
              describedBy={endBeforeStart ? 'block-end-error' : undefined}
            />
          )}
        </Field>
      </div>

      {errors.general.length > 0 ? <ErrorState message={errors.general.join(' ')} /> : null}
      {create.error && !errors.general.length && !Object.keys(errors.byField).length ? (
        <ErrorState message={apiErrorMessage(create.error, 'Could not block out this time.')} />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!complete || create.isPending}>
          {create.isPending ? 'Saving…' : 'Block out time'}
        </Button>
      </div>
    </form>
  );
}
