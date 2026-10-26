import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import {
  addMonths,
  daysInMonth,
  formatDay,
  formatMonth,
  todayInVenueTime,
  weekdayOfFirst,
} from '@/lib/calendar';
import { DAY_STATUS_STYLES } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { DayStatus, OccupancySegment } from '@/types/api';
import {
  adjacentMonths,
  usePrefetchVenueAvailability,
  useVenueAvailability,
  useVenueOccupancy,
} from '../hooks/use-venues';

/** AC-1: the current and next month are on screen together. */
const VISIBLE_MONTHS = 2;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * US-17 — a venue's availability, for a Coordinator deciding whether to
 * request it.
 *
 * Shows only what the API returns: one status per day. There is deliberately
 * no hover card or popover naming a booking — AC-3 forbids revealing whose
 * booking it is, and the cheapest way to keep that promise is to have nothing
 * to reveal it with.
 *
 * US-50 AC-3: selecting a tentative or booked day lists what occupies it —
 * each booking's setup time, event time and turnaround time, shown
 * separately. That data is as anonymous as the day status: times and
 * tentative/booked, never an event.
 *
 * AC-1: blocked-off periods are shown too, as "Blocked" days and, once
 * selected, the blocked hours. Never the reason or who blocked it.
 */
export function VenueAvailabilityCalendar({ venueId }: { venueId: string }) {
  const today = todayInVenueTime();
  const currentMonth = today.slice(0, 7);
  const [firstMonth, setFirstMonth] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const months = Array.from({ length: VISIBLE_MONTHS }, (_, i) => addMonths(firstMonth, i));
  usePrefetchVenueAvailability(venueId, adjacentMonths(firstMonth, VISIBLE_MONTHS));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <div className="flex items-center gap-2">
          {/* Past months hold nothing a Coordinator can request. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFirstMonth((m) => addMonths(m, -1))}
            disabled={firstMonth <= currentMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFirstMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {months.map((month) => (
          <MonthGrid
            key={month}
            venueId={venueId}
            month={month}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={(day) => setSelectedDay((current) => (current === day ? null : day))}
          />
        ))}
      </div>

      {selectedDay ? (
        <DayOccupancy venueId={venueId} day={selectedDay} />
      ) : (
        <p className="mt-4 text-xs text-ink-500">
          Select a tentative, booked or blocked day to see its times, including setup and
          turnaround.
        </p>
      )}
    </div>
  );
}

const SEGMENT_STYLES: Record<OccupancySegment['kind'], { label: string; className: string }> = {
  SETUP: {
    label: 'Setup',
    className: 'border border-dashed border-ink-400 bg-ink-50 text-ink-700',
  },
  EVENT: { label: 'Event', className: 'bg-ink-800 text-white' },
  TURNAROUND: {
    label: 'Turnaround',
    className: 'border border-dashed border-ink-400 bg-ink-50 text-ink-700',
  },
  BLOCKED: { label: 'Blocked', className: 'bg-rose-100 text-rose-900' },
};

/** The marker a day carries beside its number, so statuses survive greyscale. */
function StatusIcon({ status, className }: { status: DayStatus; className: string }) {
  if (status === 'tentative') return <Clock className={className} aria-hidden="true" />;
  if (status === 'blocked') return <Lock className={className} aria-hidden="true" />;
  return null;
}

const SINGAPORE_TIME = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const SINGAPORE_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' });

/** "09:30", or "23:45 (30 Sep)" when the instant falls on another day. */
function timeOn(day: string, iso: string): string {
  const instant = new Date(iso);
  const time = SINGAPORE_TIME.format(instant);
  const instantDay = SINGAPORE_DAY.format(instant);
  return instantDay === day ? time : `${time} (${formatDay(instantDay)})`;
}

/** US-50 AC-3 — the selected day's occupancy, buffers apart from event time. */
function DayOccupancy({ venueId, day }: { venueId: string; day: string }) {
  const { data, isPending, isError, error } = useVenueOccupancy(venueId, day);

  return (
    <section aria-labelledby="day-occupancy" className="mt-4 rounded-lg border border-ink-200 p-4">
      <h3 id="day-occupancy" className="text-sm font-semibold text-ink-900">
        {formatDay(day)}
      </h3>
      {isPending ? (
        <p className="mt-2 text-sm text-ink-500">Loading times…</p>
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load the times for this day.')} />
      ) : data.length === 0 ? (
        <p className="mt-2 text-sm text-ink-600">Nothing occupies this venue on this day.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((booking, i) => (
            <li key={i} className="space-y-1.5">
              <p className="text-xs font-medium text-ink-700">
                {booking.status === 'blocked'
                  ? 'Not available to book'
                  : DAY_STATUS_STYLES[booking.status].label}
              </p>
              <ol
                className="flex flex-wrap gap-1.5"
                aria-label={
                  booking.status === 'blocked' ? 'Blocked times' : 'Setup, event and turnaround times'
                }
              >
                {booking.segments.map((segment) => (
                  <li
                    key={segment.kind}
                    className={cn('rounded px-2 py-1 text-xs', SEGMENT_STYLES[segment.kind].className)}
                  >
                    <span className="font-medium">{SEGMENT_STYLES[segment.kind].label}</span>{' '}
                    {timeOn(day, segment.start)}–{timeOn(day, segment.end)}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600" aria-label="Legend">
      {(Object.keys(DAY_STATUS_STYLES) as DayStatus[]).map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded text-[10px]',
              DAY_STATUS_STYLES[status].className,
            )}
            aria-hidden="true"
          >
            {status === 'tentative' || status === 'blocked' ? (
              <StatusIcon status={status} className="size-3" />
            ) : (
              '8'
            )}
          </span>
          {DAY_STATUS_STYLES[status].label}
        </li>
      ))}
      <li className="text-ink-400">Singapore time</li>
    </ul>
  );
}

/** AC-2: each month is its own query, so it loads on its own. */
function MonthGrid({
  venueId,
  month,
  today,
  selectedDay,
  onSelectDay,
}: {
  venueId: string;
  month: string;
  today: string;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const { data, isPending, isError, error } = useVenueAvailability(venueId, month);
  const statusByDay = new Map(data?.map((day) => [day.date, day.status]));

  const leading = weekdayOfFirst(month);
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from(
      { length: daysInMonth(month) },
      (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <section aria-labelledby={`month-${month}`} aria-busy={isPending}>
      <h3 id={`month-${month}`} className="mb-2 text-sm font-semibold text-ink-900">
        {formatMonth(month)}
      </h3>

      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load availability for this month.')} />
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
          <caption className="sr-only">Availability for {formatMonth(month)}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day} scope="col" className="pb-1 text-xs font-medium text-ink-500">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={i}>
                {week.map((day, j) =>
                  day ? (
                    <DayCell
                      key={day}
                      day={day}
                      status={statusByDay.get(day)}
                      isPast={day < today}
                      isToday={day === today}
                      isSelected={day === selectedDay}
                      onSelect={() => onSelectDay(day)}
                    />
                  ) : (
                    <td key={`blank-${j}`} aria-hidden="true" />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DayCell({
  day,
  status,
  isPast,
  isToday,
  isSelected,
  onSelect,
}: {
  day: string;
  status: DayStatus | undefined;
  isPast: boolean;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Still loading: a neutral placeholder rather than a misleading "free".
  if (!status) {
    return (
      <td>
        <div className="h-10 animate-pulse rounded-md bg-ink-100" aria-hidden="true" />
      </td>
    );
  }

  const style = DAY_STATUS_STYLES[status];
  // US-50 AC-3: an occupied day can be selected to see its times.
  const Cell = status === 'free' ? 'div' : 'button';

  return (
    <td>
      <Cell
        {...(Cell === 'button'
          ? { type: 'button' as const, onClick: onSelect, 'aria-pressed': isSelected }
          : {})}
        className={cn(
          'relative flex h-10 w-full items-center justify-center rounded-md',
          style.className,
          // Past days keep their real status but recede: nothing to request there.
          isPast && 'opacity-40',
          isToday && 'ring-2 ring-brand-600',
          isSelected && 'ring-2 ring-ink-900',
        )}
      >
        <span className="text-xs font-medium tabular-nums" aria-hidden="true">
          {Number(day.slice(8))}
        </span>
        <StatusIcon status={status} className="absolute right-1 top-1 size-2.5" />
        <span className="sr-only">
          {formatDay(day)}: {style.label}
          {isPast ? ' (past)' : ''}
          {isToday ? ' (today)' : ''}
        </span>
      </Cell>
    </td>
  );
}
