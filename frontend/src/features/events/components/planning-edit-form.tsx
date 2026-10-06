import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { CheckboxRow, Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useUpdatePlanning } from '@/features/events/hooks/use-events';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { todayInVenueTime } from '@/lib/calendar';
import { START_TIME_SLOTS, TIME_SLOTS } from '@/lib/date-time';
import { humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURES,
  ACCESSIBILITY_FEATURE_LABELS,
  ROOM_LAYOUTS,
  type AccessibilityFeature,
  type CoordinatorRequestView,
  type PlanningUpdatePayload,
  type PlanningUpdateResult,
  type RoomLayout,
} from '@/types/api';
import { toDateTimeLocal } from '../lib/change-format';

interface FormState {
  name: string;
  category: string;
  purpose: string;
  description: string;
  programme: string;
  proposedStart: string;
  proposedEnd: string;
  expectedAttendance: string;
  preferredLayout: RoomLayout | '';
  layoutNotes: string;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string;
  equipmentNeeds: string;
  registrationEnabled: boolean;
}

const FIELDS = [
  'name',
  'category',
  'purpose',
  'description',
  'programme',
  'proposedStart',
  'proposedEnd',
  'expectedAttendance',
  'preferredLayout',
  'layoutNotes',
  'accessibilityRequirements',
  'accessibilityNotes',
  'equipmentNeeds',
  'registrationEnabled',
] as const;

function initialState(event: CoordinatorRequestView): FormState {
  return {
    name: event.name ?? '',
    category: event.category ?? '',
    purpose: event.purpose ?? '',
    description: event.description ?? '',
    programme: event.programme ?? '',
    proposedStart: toDateTimeLocal(event.proposedStart),
    proposedEnd: toDateTimeLocal(event.proposedEnd),
    expectedAttendance: event.expectedAttendance?.toString() ?? '',
    preferredLayout: event.preferredLayout ?? '',
    layoutNotes: event.layoutNotes ?? '',
    accessibilityRequirements: event.accessibilityRequirements,
    accessibilityNotes: event.accessibilityNotes ?? '',
    equipmentNeeds: event.equipmentNeeds ?? '',
    registrationEnabled: event.registrationEnabled,
  };
}

/**
 * Only fields the Coordinator actually touched are sent. The server diffs
 * anyway, but re-sending an untouched start date would re-run "must be in the
 * future" against a value nobody changed.
 */
function dirtyPayload(initial: FormState, current: FormState): PlanningUpdatePayload {
  const payload: PlanningUpdatePayload = {};
  const changed = (key: keyof FormState) =>
    JSON.stringify(initial[key]) !== JSON.stringify(current[key]);
  const optionalText = (value: string) => (value.trim() === '' ? null : value);

  if (changed('name')) payload.name = current.name.trim();
  if (changed('category')) payload.category = current.category.trim();
  if (changed('purpose')) payload.purpose = current.purpose.trim();
  if (changed('description')) payload.description = current.description.trim();
  if (changed('programme')) payload.programme = optionalText(current.programme);
  if (changed('proposedStart') && current.proposedStart)
    payload.proposedStart = new Date(current.proposedStart).toISOString();
  if (changed('proposedEnd') && current.proposedEnd)
    payload.proposedEnd = new Date(current.proposedEnd).toISOString();
  if (changed('expectedAttendance'))
    payload.expectedAttendance = Number(current.expectedAttendance);
  if (changed('preferredLayout')) payload.preferredLayout = current.preferredLayout || null;
  if (changed('layoutNotes')) payload.layoutNotes = optionalText(current.layoutNotes);
  if (changed('accessibilityRequirements'))
    payload.accessibilityRequirements = current.accessibilityRequirements;
  if (changed('accessibilityNotes'))
    payload.accessibilityNotes = optionalText(current.accessibilityNotes);
  if (changed('equipmentNeeds')) payload.equipmentNeeds = optionalText(current.equipmentNeeds);
  if (changed('registrationEnabled')) payload.registrationEnabled = current.registrationEnabled;

  return payload;
}

/** US-25 AC-1 — the Coordinator's edit form for an event in planning. */
export function PlanningEditForm({
  event,
  onSaved,
  onCancel,
}: {
  event: CoordinatorRequestView;
  onSaved: (result: PlanningUpdateResult) => void;
  onCancel: () => void;
}) {
  const [initial] = useState(() => initialState(event));
  const [form, setForm] = useState(initial);
  const update = useUpdatePlanning(event.id);

  const payload = dirtyPayload(initial, form);
  const isDirty = Object.keys(payload).length > 0;
  const { byField, general } = fieldErrors(update.error, FIELDS);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function toggleFeature(feature: AccessibilityFeature, checked: boolean) {
    set(
      'accessibilityRequirements',
      checked
        ? [...form.accessibilityRequirements, feature]
        : form.accessibilityRequirements.filter((f) => f !== feature),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate(payload, { onSuccess: onSaved });
  }

  const text = (key: keyof FormState, label: string, required = false) => (
    <Field label={label} htmlFor={`plan-${key}`} errors={byField[key]} required={required}>
      <Input
        id={`plan-${key}`}
        value={form[key] as string}
        aria-invalid={Boolean(byField[key])}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  );

  const area = (key: keyof FormState, label: string, rows = 3, hint?: string) => (
    <Field label={label} htmlFor={`plan-${key}`} errors={byField[key]} hint={hint}>
      <Textarea
        id={`plan-${key}`}
        rows={rows}
        value={form[key] as string}
        aria-invalid={Boolean(byField[key])}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  );

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {text('name', 'Event name', true)}
        {text('category', 'Category', true)}
        <div className="sm:col-span-2">{area('purpose', 'Purpose', 2)}</div>
        <div className="sm:col-span-2">{area('description', 'Description', 3)}</div>
        <div className="sm:col-span-2">
          {area('programme', 'Programme', 5, 'The running order — sessions, times, speakers.')}
        </div>
      </div>

      {/* Themed calendar + venue-hours time slots, like every other event form. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start" htmlFor="plan-start" errors={byField.proposedStart} required>
          <DateTimeField
            id="plan-start"
            label="Start"
            value={form.proposedStart}
            onChange={(value) => set('proposedStart', value)}
            slots={START_TIME_SLOTS}
            min={todayInVenueTime()}
            invalid={Boolean(byField.proposedStart?.length)}
          />
        </Field>
        <Field label="End" htmlFor="plan-end" errors={byField.proposedEnd} required>
          <DateTimeField
            id="plan-end"
            label="End"
            value={form.proposedEnd}
            onChange={(value) => set('proposedEnd', value)}
            slots={TIME_SLOTS}
            min={form.proposedStart.slice(0, 10) || todayInVenueTime()}
            invalid={Boolean(byField.proposedEnd?.length)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Expected attendance"
          htmlFor="plan-attendance"
          errors={byField.expectedAttendance}
          required
        >
          <Input
            id="plan-attendance"
            type="number"
            min={1}
            value={form.expectedAttendance}
            onChange={(e) => set('expectedAttendance', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Preferred layout" htmlFor="plan-layout" errors={byField.preferredLayout}>
          <Select
            id="plan-layout"
            value={form.preferredLayout}
            onChange={(e) => set('preferredLayout', e.target.value as RoomLayout | '')}
          >
            <option value="">No preference</option>
            {ROOM_LAYOUTS.map((layout) => (
              <option key={layout} value={layout}>
                {humanise(layout)}
              </option>
            ))}
          </Select>
        </Field>
        {area('layoutNotes', 'Layout notes', 2)}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-800">Accessibility requirements</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {ACCESSIBILITY_FEATURES.map((feature) => (
            <CheckboxRow
              key={feature}
              id={`plan-access-${feature}`}
              label={ACCESSIBILITY_FEATURE_LABELS[feature]}
              checked={form.accessibilityRequirements.includes(feature)}
              onChange={(checked) => toggleFeature(feature, checked)}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {area('accessibilityNotes', 'Accessibility notes', 2)}
        {area('equipmentNeeds', 'Equipment needs', 2)}
      </div>

      <CheckboxRow
        id="plan-registration"
        label="Open to attendee registration"
        checked={form.registrationEnabled}
        onChange={(checked) => set('registrationEnabled', checked)}
      />

      {general.length > 0 || (update.error && Object.keys(byField).length === 0) ? (
        <p className="text-sm text-red-700">
          {general.length > 0
            ? general.join(' ')
            : apiErrorMessage(update.error, 'Could not save these changes.')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!isDirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
