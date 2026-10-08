import { useState } from 'react';

import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/form';
import { slotsIncluding, type TimeSlot } from '@/lib/date-time';
import { cn } from '@/lib/utils';

const datePart = (value: string) => (value ? value.slice(0, 10) : '');
const timePart = (value: string) => (value ? value.slice(11, 16) : '');

/**
 * A themed date + time field: the platform calendar beside a time dropdown.
 * Replaces the browser's datetime-local input, which cannot be styled.
 *
 * Reads and writes the same "YYYY-MM-DDTHH:mm" local string datetime-local
 * used, so a form only swaps the input. A value is reported only once both
 * halves are chosen; until then the form sees '' and its own validation
 * applies, while the half already picked stays on screen.
 */
export function DateTimeField({
  id,
  label,
  value,
  onChange,
  slots,
  min,
  invalid = false,
  describedBy,
  className,
}: {
  /** Goes on the date part, so a <Field htmlFor> label points at it. */
  id: string;
  /** Accessible name, e.g. "Start". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The times offered, e.g. TIME_SLOTS or FULL_DAY_TIME_SLOTS. */
  slots: TimeSlot[];
  /** Earliest selectable day ("YYYY-MM-DD"). */
  min?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const [date, setDate] = useState(datePart(value));
  const [time, setTime] = useState(timePart(value));
  // What this field last reported. A different incoming value was set from
  // outside (a reset, a prefill), so the halves follow it.
  const [reported, setReported] = useState(value);
  if (value !== reported) {
    setReported(value);
    setDate(datePart(value));
    setTime(timePart(value));
  }

  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    const next = nextDate && nextTime ? `${nextDate}T${nextTime}` : '';
    setReported(next);
    onChange(next);
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <div className="min-w-0 flex-1">
        <DatePicker
          id={id}
          label={`${label} date`}
          placeholder="Select a date"
          value={date}
          onChange={(nextDate) => update(nextDate, time)}
          min={min}
          invalid={invalid}
          describedBy={describedBy}
        />
      </div>
      <Select
        id={`${id}-time`}
        aria-label={`${label} time`}
        className={cn('w-36 shrink-0', !time && 'text-ink-400')}
        value={time}
        onChange={(e) => update(date, e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <option value="">Time</option>
        {slotsIncluding(slots, time).map((slot) => (
          <option key={slot.value} value={slot.value} className="text-ink-900">
            {slot.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
