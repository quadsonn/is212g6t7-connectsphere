import { useState } from 'react';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import {
  useCheckAvailability,
  useEquipmentCatalogue,
} from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import {
  combineDateTime,
  isoToLocalParts,
  localStringToInstant,
  slotsIncluding,
  START_TIME_SLOTS,
  TIME_SLOTS,
} from '@/lib/date-time';
import { EQUIPMENT_STATUS_STYLES } from '@/lib/status';
import { formatDateRange } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { todayInVenueTime } from '@/lib/calendar';

interface EquipmentRow {
  key: number;
  equipmentId: string;
  quantity: string;
}

let nextRowKey = 1;
const newRow = (equipmentId = '', quantity = '1'): EquipmentRow => ({
  key: nextRowKey++,
  equipmentId,
  quantity,
});

/**
 * US-30 — REAL data, GET /equipment/:id/availability.
 *
 * Several equipment types can be checked for the same date and time at once:
 * the first row is required, more can be added below, and each row is checked
 * with its own call to the single-item endpoint (in parallel).
 *
 * Accepts start, end, equipmentId and quantity as query parameters so the
 * event requirements page (US-31/US-32) can open it pre-filled with the
 * event's date and time.
 */
export function EquipmentAvailability() {
  const [params] = useSearchParams();
  // Date and time kept as separate fields, as on the event request form.
  const [startDate, setStartDate] = useState(() => isoToLocalParts(params.get('start')).date);
  const [startTime, setStartTime] = useState(() => isoToLocalParts(params.get('start')).time);
  const [endDate, setEndDate] = useState(() => isoToLocalParts(params.get('end')).date);
  const [endTime, setEndTime] = useState(() => isoToLocalParts(params.get('end')).time);
  const [rows, setRows] = useState<EquipmentRow[]>(() => [
    newRow(params.get('equipmentId') ?? '', params.get('quantity') ?? '1'),
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  const catalogue = useEquipmentCatalogue();
  const check = useCheckAvailability();
  const results = check.data;

  // Checked as soon as all four fields are filled, not only on submit, so a
  // bad range is flagged under "Ends" while the times are being picked.
  const startValue = combineDateTime(startDate, startTime);
  const endValue = combineDateTime(endDate, endTime);
  const windowError =
    startValue && endValue && new Date(endValue) <= new Date(startValue)
      ? 'The end must be after the start.'
      : null;

  // Editing a date or time clears a stale submit-time message about it.
  const onWindowChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setFormError(null);
  };

  const updateRow = (key: number, patch: Partial<EquipmentRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const removeRow = (key: number) => setRows((prev) => prev.filter((row) => row.key !== key));
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  // Each type once per check — it is already chosen in another row.
  const chosenElsewhere = (row: EquipmentRow, id: string) =>
    rows.some((other) => other.key !== row.key && other.equipmentId === id);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const start = startValue;
    const end = endValue;
    if (!start || !end) {
      setFormError('Choose a start and end date and time.');
      return;
    }
    // Already shown inline under "Ends"; just don't submit.
    if (windowError) return;
    if (!rows[0].equipmentId) {
      setFormError('Choose an equipment type.');
      return;
    }

    // Extra rows left on "Choose equipment…" are simply ignored.
    const filled = rows.filter((row) => row.equipmentId);
    const badQuantity = filled.find((row) => {
      const n = Number(row.quantity);
      return !Number.isInteger(n) || n < 1;
    });
    if (badQuantity) {
      setFormError('Each quantity must be a whole number of at least 1.');
      return;
    }

    // The inputs are Singapore wall-clock time; the API expects a UTC instant.
    check.mutate({
      start: localStringToInstant(start),
      end: localStringToInstant(end),
      items: filled.map((row) => ({
        equipmentId: row.equipmentId,
        quantity: Number(row.quantity),
      })),
    });
  };

  const shortCount = results?.filter((item) => !item.fullyAvailable).length ?? 0;

  return (
    <>
      <PageHeader
        title="Check availability"
        description="How many units of each equipment type are free for a date and time."
      />

      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts" htmlFor="availability-start-date" required>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <DatePicker
                      id="availability-start-date"
                      label="Start date"
                      placeholder="Select a date"
                      value={startDate}
                      onChange={onWindowChange(setStartDate)}
                      min={todayInVenueTime()}
                    />
                  </div>
                  <Select
                    id="availability-start-time"
                    aria-label="Start time"
                    className="w-36"
                    value={startTime}
                    onChange={(e) => onWindowChange(setStartTime)(e.target.value)}
                  >
                    <option value="">Time</option>
                    {slotsIncluding(START_TIME_SLOTS, startTime).map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
              <Field
                label="Ends"
                htmlFor="availability-end-date"
                required
                errors={windowError ? [windowError] : undefined}
              >
                <div className="flex gap-2">
                  <div className="flex-1">
                    <DatePicker
                      id="availability-end-date"
                      label="End date"
                      placeholder="Select a date"
                      value={endDate}
                      onChange={onWindowChange(setEndDate)}
                      min={startDate || todayInVenueTime()}
                      invalid={Boolean(windowError)}
                      describedBy={windowError ? 'availability-end-date-error' : undefined}
                    />
                  </div>
                  <Select
                    id="availability-end-time"
                    aria-label="End time"
                    className="w-36"
                    value={endTime}
                    onChange={(e) => onWindowChange(setEndTime)(e.target.value)}
                    aria-invalid={windowError ? true : undefined}
                    aria-describedby={windowError ? 'availability-end-date-error' : undefined}
                  >
                    <option value="">Time</option>
                    {slotsIncluding(TIME_SLOTS, endTime).map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => {
                const first = index === 0;
                const itemId = `availability-item-${row.key}`;
                const quantityId = `availability-quantity-${row.key}`;

                const itemSelect = (
                  <Select
                    id={itemId}
                    aria-label={first ? undefined : `Equipment type ${index + 1}`}
                    value={row.equipmentId}
                    onChange={(e) => updateRow(row.key, { equipmentId: e.target.value })}
                  >
                    <option value="">Choose equipment…</option>
                    {catalogue.data?.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={chosenElsewhere(row, item.id)}
                      >
                        {item.type}
                        {item.location ? ` — ${item.location}` : ''}
                      </option>
                    ))}
                  </Select>
                );
                const quantityInput = (
                  <Input
                    id={quantityId}
                    type="number"
                    min={1}
                    step={1}
                    aria-label={first ? undefined : `Quantity for equipment type ${index + 1}`}
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                );

                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-[1fr_6rem_2.5rem] items-end gap-3 sm:grid-cols-[1fr_8rem_2.5rem]"
                  >
                    {first ? (
                      <>
                        {/* Only the first row is required. */}
                        <Field label="Equipment type" htmlFor={itemId} required>
                          {itemSelect}
                        </Field>
                        <Field label="Quantity" htmlFor={quantityId} required>
                          {quantityInput}
                        </Field>
                        <span aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        {itemSelect}
                        {quantityInput}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-10"
                          onClick={() => removeRow(row.key)}
                          aria-label={`Remove equipment type ${index + 1}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}

              <Button type="button" variant="secondary" size="sm" onClick={addRow}>
                <Plus className="size-4" aria-hidden="true" />
                Add another equipment type
              </Button>
            </div>

            {catalogue.isError ? (
              <ErrorState message={apiErrorMessage(catalogue.error, 'Could not load the catalogue.')} />
            ) : null}
            {formError ? <ErrorState message={formError} /> : null}
            {check.isError ? (
              <ErrorState message={apiErrorMessage(check.error, 'Could not check availability.')} />
            ) : null}

            <Button type="submit" disabled={check.isPending || Boolean(windowError)}>
              {check.isPending ? 'Checking…' : 'Check availability'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results && results.length > 0 ? (
        <Card className="mt-6" aria-live="polite">
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <span className="text-sm text-ink-500">
              {formatDateRange(results[0].start, results[0].end)}
            </span>
          </CardHeader>

          <div
            className={
              shortCount === 0
                ? 'flex items-center gap-2 border-y border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900'
                : 'flex items-center gap-2 border-y border-red-200 bg-red-50 px-5 py-3 text-sm text-red-900'
            }
          >
            {shortCount === 0 ? (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="size-4 shrink-0" aria-hidden="true" />
            )}
            {shortCount === 0
              ? 'Every requested quantity is available.'
              : `${shortCount} of ${results.length} requested ${results.length === 1 ? 'type is' : 'types are'} not fully available.`}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Available units for each requested equipment type
              </caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Type</th>
                  <th scope="col" className="px-5 py-3 font-medium">Requested</th>
                  <th scope="col" className="px-5 py-3 font-medium">Available</th>
                  <th scope="col" className="px-5 py-3 font-medium">Shortfall</th>
                  <th scope="col" className="px-5 py-3 font-medium">Reserved for overlapping events</th>
                  <th scope="col" className="px-5 py-3 font-medium">Damaged / maintenance</th>
                  <th scope="col" className="px-5 py-3 font-medium">Total</th>
                  <th scope="col" className="px-5 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {results.map((item) => (
                  <tr key={item.equipmentId}>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink-900">{item.type}</div>
                      {item.operationalStatus !== 'OPERATIONAL' ? (
                        <Badge
                          className={`mt-1 ${EQUIPMENT_STATUS_STYLES[item.operationalStatus].className}`}
                          srPrefix="Status"
                        >
                          {EQUIPMENT_STATUS_STYLES[item.operationalStatus].label}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-600">{item.requestedQuantity}</td>
                    <td className="px-5 py-3.5 tabular-nums font-semibold text-ink-900">
                      {item.availableQuantity}
                    </td>
                    <td
                      className={
                        item.shortfall > 0
                          ? 'px-5 py-3.5 tabular-nums font-semibold text-red-700'
                          : 'px-5 py-3.5 tabular-nums text-ink-500'
                      }
                    >
                      {item.shortfall > 0 ? `${item.shortfall} short` : 'None'}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-600">{item.reservedQuantity}</td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-600">{item.unavailableQuantity}</td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-600">{item.totalQuantity}</td>
                    <td className="px-5 py-3.5">
                      {/* AC-4: whether this type's requested quantity is fully available. */}
                      {item.fullyAvailable ? (
                        <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">
                          Available
                        </Badge>
                      ) : (
                        <Badge className="bg-red-50 text-red-800 ring-red-300">
                          Short by {item.shortfall}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
