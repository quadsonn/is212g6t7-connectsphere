/**
 * Reasonable capacity bands rather than an exact headcount — an Organiser
 * rarely knows attendance to the person this early, and the number only
 * needs to be accurate enough to match against venue capacity.
 *
 * Shared between the New/Edit request form (which writes `value` as
 * expectedAttendance) and anywhere the stored number is displayed back, so
 * a selection always round-trips to the same label rather than a bare
 * number that looks disconnected from what was picked.
 */
export const ATTENDANCE_BANDS: { value: string; label: string }[] = [
  { value: '9', label: 'Fewer than 10' },
  { value: '49', label: '10 – 49' },
  { value: '99', label: '50 – 99' },
  { value: '199', label: '100 – 199' },
  { value: '499', label: '200 – 499' },
  { value: '500', label: '500 or more' },
];

/**
 * Looks a stored expectedAttendance number back up to the band label it was
 * selected from. Falls back to the plain number for values that don't match
 * a band exactly (e.g. seed/legacy data written before bands existed) —
 * still real data, just not from this dropdown.
 */
export function attendanceBandLabel(value: number | null): string {
  if (value == null) return '—';
  const band = ATTENDANCE_BANDS.find((b) => Number(b.value) === value);
  return band ? band.label : String(value);
}
