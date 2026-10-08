import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

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
import type { DayStatus } from '@/types/api';
import {
  adjacentMonths,
  usePrefetchVenueAvailability,
  useVenueAvailability,
} from '../hooks/use-venues';

/** AC-1: the current and next month are on screen together. */
const VISIBLE_MONTHS = 2;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * US-17 — a venue's availability, for a Coordinator deciding whether to
 * request it.
 *
 * Shows only what the API returns: one status per day. There is deliberately
 * no hover card, popover or click-through for a booked day — AC-3 forbids
 * revealing whose booking it is, and the cheapest way to keep that promise is
 * to have nothing to reveal it with.
 */
export function VenueAvailabilityCalendar({ venueId }: { venueId: string }) {
  const today = todayInVenueTime();
  const currentMonth = today.slice(0, 7);
  const [firstMonth, setFirstMonth] = useState(currentMonth);

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
          <MonthGrid key={month} venueId={venueId} month={month} today={today} />
        ))}
      </div>
    </div>
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
            {status === 'tentative' ? <Clock className="size-3" /> : '8'}
          </span>
          {DAY_STATUS_STYLES[status].label}
        </li>
      ))}
      <li className="text-ink-400">Singapore time</li>
    </ul>
  );
}

/** AC-2: each month is its own query, so it loads on its own. */
function MonthGrid({ venueId, month, today }: { venueId: string; month: string; today: string }) {
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
                    <DayCell key={day} day={day} status={statusByDay.get(day)} isPast={day < today} isToday={day === today} />
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
}: {
  day: string;
  status: DayStatus | undefined;
  isPast: boolean;
  isToday: boolean;
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

  return (
    <td>
      <div
        className={cn(
          'relative flex h-10 items-center justify-center rounded-md',
          style.className,
          // Past days keep their real status but recede: nothing to request there.
          isPast && 'opacity-40',
          isToday && 'ring-2 ring-brand-600',
        )}
      >
        <span className="text-xs font-medium tabular-nums" aria-hidden="true">
          {Number(day.slice(8))}
        </span>
        {status === 'tentative' ? (
          <Clock className="absolute right-1 top-1 size-2.5" aria-hidden="true" />
        ) : null}
        <span className="sr-only">
          {formatDay(day)}: {style.label}
          {isPast ? ' (past)' : ''}
          {isToday ? ' (today)' : ''}
        </span>
      </div>
    </td>
  );
}
