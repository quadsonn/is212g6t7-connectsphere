import { Select } from '@/components/ui/form';
import { ATTENDANCE_BANDS, attendanceBandLabel } from '@/lib/attendance-bands';

/**
 * Expected attendance as a range, the same list the event request form uses,
 * reporting the range's stored value. A stored number that is not one of the
 * ranges (older data) is kept as its own selected option, so the form never
 * hides or silently changes what the event has now.
 */
export function AttendanceSelect({
  value,
  onChange,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const isOtherValue = value !== '' && !ATTENDANCE_BANDS.some((band) => band.value === value);

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {isOtherValue ? <option value={value}>{attendanceBandLabel(Number(value))}</option> : null}
      {value === '' ? <option value="">Select a range</option> : null}
      {ATTENDANCE_BANDS.map((band) => (
        <option key={band.value} value={band.value}>
          {band.label}
        </option>
      ))}
    </Select>
  );
}
