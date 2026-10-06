import { useEffect, useId, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import {
  addDays,
  addMonths,
  daysInMonth,
  formatDay,
  formatMonth,
  formatShortDay,
  todayInVenueTime,
  weekdayOf,
  weekdayOfFirst,
} from '@/lib/calendar';
import { cn } from '@/lib/utils';

const WEEKDAYS = [
  ['Mo', 'Monday'],
  ['Tu', 'Tuesday'],
  ['We', 'Wednesday'],
  ['Th', 'Thursday'],
  ['Fr', 'Friday'],
  ['Sa', 'Saturday'],
  ['Su', 'Sunday'],
] as const;

/**
 * A themed date field: a button that opens a month grid in a popover.
 * Replaces the browser's native picker, which cannot be styled.
 *
 * Follows the WAI-ARIA date picker dialog pattern: arrows move by day/week,
 * PageUp/PageDown by month, Home/End to the week's ends, Enter or Space
 * picks, Escape closes and returns focus to the field. Weeks start on Monday
 * and dates are plain "YYYY-MM-DD" in Singapore time, like the venue
 * availability calendar.
 */
export function DatePicker({
  value,
  onChange,
  min,
  placeholder = 'Any date',
  label,
  id,
  invalid = false,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable day; earlier days are shown but disabled. */
  min?: string;
  placeholder?: string;
  /** Accessible name for the field. */
  label: string;
  /** Lets a <Field htmlFor> label point at the picker, like any input. */
  id?: string;
  /** Shows the error state, as Input does with aria-invalid. */
  invalid?: boolean;
  /** Ids of hint/error text describing the field. */
  describedBy?: string;
}) {
  const today = todayInVenueTime();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(
    value || (min && min > today ? min : today),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const month = focused.slice(0, 7);
  const isDisabled = (day: string) => Boolean(min && day < min);

  // Close on a click outside.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep keyboard focus on the focused day while the grid is open.
  useEffect(() => {
    if (open) {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)
        ?.focus();
    }
  }, [open, focused]);

  const openPicker = () => {
    setFocused(value || (min && min > today ? min : today));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const pick = (day: string) => {
    if (isDisabled(day)) return;
    onChange(day);
    close();
  };

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekdayOf(focused)),
      End: () => addDays(focused, 6 - weekdayOf(focused)),
      PageUp: () => shiftMonth(focused, -1),
      PageDown: () => shiftMonth(focused, 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      // Disabled days cannot hold focus, so never move before `min`.
      const next = move();
      setFocused(min && next < min ? min : next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(focused);
    }
  };

  const leading = weekdayOfFirst(month);
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from(
      { length: daysInMonth(month) },
      (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const canGoBack = !min || addMonths(month, -1) >= min.slice(0, 7);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={`${label}: ${value ? formatDay(value) : placeholder}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => (open ? close() : openPicker())}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-ink-300 bg-white px-3 text-left text-sm',
          'focus:border-brand-600 focus:outline-2 focus:outline-offset-0 focus:outline-brand-600',
          open && 'border-brand-600',
          invalid && 'border-red-500 outline-red-500',
        )}
      >
        <CalendarDays
          className="size-4 shrink-0 text-ink-400"
          aria-hidden="true"
        />
        <span
          className={cn(
            'flex-1 truncate',
            value ? 'text-ink-900' : 'text-ink-400',
          )}
        >
          {value ? formatShortDay(value) : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-ink-400 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-label={`Choose ${label.toLowerCase()}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="absolute left-0 z-30 mt-2 w-full min-w-64 rounded-lg border border-ink-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFocused(shiftMonth(focused, -1))}
              disabled={!canGoBack}
              aria-label="Previous month"
              className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <p
              className="text-sm font-semibold text-ink-900"
              aria-live="polite"
            >
              {formatMonth(month)}
            </p>
            <button
              type="button"
              onClick={() => setFocused(shiftMonth(focused, 1))}
              aria-label="Next month"
              className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={formatMonth(month)}
            onKeyDown={onGridKeyDown}
          >
            <div role="row" className="grid grid-cols-7">
              {WEEKDAYS.map(([short, full]) => (
                <span
                  key={short}
                  role="columnheader"
                  aria-label={full}
                  className="pb-1 text-center text-[11px] font-medium text-ink-400"
                >
                  {short}
                </span>
              ))}
            </div>
            {weeks.map((week, i) => (
              <div key={i} role="row" className="grid grid-cols-7">
                {week.map((day, j) =>
                  day ? (
                    <div
                      key={day}
                      role="gridcell"
                      aria-selected={day === value}
                      className="p-0.5"
                    >
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={day === focused ? 0 : -1}
                        disabled={isDisabled(day)}
                        aria-label={`${formatDay(day)}${day === today ? ', today' : ''}`}
                        onClick={() => pick(day)}
                        className={cn(
                          'flex size-8 w-full items-center justify-center rounded-md text-xs tabular-nums transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                          'disabled:cursor-not-allowed disabled:text-ink-300',
                          day === value
                            ? 'bg-brand-600 font-semibold text-white hover:bg-brand-700'
                            : 'text-ink-800 hover:bg-ink-100',
                          day === today &&
                            day !== value &&
                            'font-semibold text-brand-700 ring-1 ring-inset ring-brand-200',
                        )}
                      >
                        {Number(day.slice(8))}
                      </button>
                    </div>
                  ) : (
                    <div
                      key={`blank-${j}`}
                      role="gridcell"
                      aria-hidden="true"
                    />
                  ),
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                onChange('');
                close();
              }}
              className="rounded-md px-2 py-1 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => pick(today)}
              disabled={isDisabled(today)}
              className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Same day-of-month in another month, clamped to that month's length. */
function shiftMonth(day: string, delta: number): string {
  const month = addMonths(day.slice(0, 7), delta);
  const dayOfMonth = Math.min(Number(day.slice(8)), daysInMonth(month));
  return `${month}-${String(dayOfMonth).padStart(2, '0')}`;
}
