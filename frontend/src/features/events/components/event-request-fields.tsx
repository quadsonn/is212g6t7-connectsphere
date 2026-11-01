import { CheckboxRow, ChipGroup, Field, Select, Textarea } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import {
  OTHER_LAYOUT,
  START_TIME_SLOTS,
  TIME_SLOTS,
  type EventRequestFormState,
  type SetEventRequestField,
} from '@/features/events/lib/event-request-form';
import { ATTENDANCE_BANDS } from '@/lib/attendance-bands';
import { todayInVenueTime } from '@/lib/calendar';
import { humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURES,
  ACCESSIBILITY_FEATURE_LABELS,
  FACILITIES,
  FACILITY_LABELS,
  ROOM_LAYOUTS,
} from '@/types/api';

/** The three cards of request fields: about, schedule and attendance, layout and accessibility. */
export function EventRequestFields({
  form,
  set,
  errors,
}: {
  form: EventRequestFormState;
  set: SetEventRequestField;
  /** Server errors by field (US-03 AC-3). */
  errors: Record<string, string[]>;
}) {
  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>About the event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Event name" htmlFor="name" errors={errors.name} required>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={invalid('name')}
            />
          </Field>

          <Field label="Category" htmlFor="category" errors={errors.category} required
            hint="e.g. Student engagement, Conference, Workshop">
            <Input
              id="category"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              aria-invalid={invalid('category')}
            />
          </Field>

          <Field label="Purpose" htmlFor="purpose" errors={errors.purpose} required>
            <Textarea
              id="purpose"
              rows={2}
              value={form.purpose}
              onChange={(e) => set('purpose', e.target.value)}
              aria-invalid={invalid('purpose')}
            />
          </Field>

          <Field label="Description" htmlFor="description" errors={errors.description} required>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              aria-invalid={invalid('description')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule and attendance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Starts"
            htmlFor="proposedStartDate"
            errors={errors.proposedStart}
            required
            hint="Venues can be booked 6:00 AM – 11:30 PM. Last start time is 11:00 PM."
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <DatePicker
                  id="proposedStartDate"
                  label="Start date"
                  placeholder="Select a date"
                  value={form.proposedStartDate}
                  onChange={(value) => set('proposedStartDate', value)}
                  min={todayInVenueTime()}
                  invalid={invalid('proposedStart')}
                />
              </div>
              <Select
                id="proposedStartTime"
                aria-label="Start time"
                className="w-36"
                value={form.proposedStartTime}
                onChange={(e) => set('proposedStartTime', e.target.value)}
                aria-invalid={invalid('proposedStart')}
              >
                <option value="">Time</option>
                {START_TIME_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </Select>
            </div>
          </Field>

          <Field
            label="Ends"
            htmlFor="proposedEndDate"
            errors={errors.proposedEnd}
            required
            hint="Venues can be booked 6:00 AM – 11:30 PM."
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <DatePicker
                  id="proposedEndDate"
                  label="End date"
                  placeholder="Select a date"
                  value={form.proposedEndDate}
                  onChange={(value) => set('proposedEndDate', value)}
                  min={form.proposedStartDate || todayInVenueTime()}
                  invalid={invalid('proposedEnd')}
                />
              </div>
              <Select
                id="proposedEndTime"
                aria-label="End time"
                className="w-36"
                value={form.proposedEndTime}
                onChange={(e) => set('proposedEndTime', e.target.value)}
                aria-invalid={invalid('proposedEnd')}
              >
                <option value="">Time</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </Select>
            </div>
          </Field>

          <Field
            label="Expected attendance"
            htmlFor="expectedAttendance"
            errors={errors.expectedAttendance}
            required
            hint="Used to match this event with a suitably sized venue."
          >
            <Select
              id="expectedAttendance"
              value={form.expectedAttendance}
              onChange={(e) => set('expectedAttendance', e.target.value)}
              aria-invalid={invalid('expectedAttendance')}
            >
              <option value="">Select a range</option>
              {ATTENDANCE_BANDS.map((band) => (
                <option key={band.value} value={band.value}>
                  {band.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end pb-1">
            <CheckboxRow
              id="registrationEnabled"
              label="Open this event for attendee registration"
              checked={form.registrationEnabled}
              onChange={(checked) => set('registrationEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Layout and accessibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Preferred layout"
            htmlFor="preferredLayout"
            errors={errors.preferredLayout}
            hint={
              form.preferredLayout === OTHER_LAYOUT
                ? 'Please describe the layout you need in the layout notes below.'
                : undefined
            }
          >
            <Select
              id="preferredLayout"
              value={form.preferredLayout}
              onChange={(e) => set('preferredLayout', e.target.value)}
              aria-invalid={invalid('preferredLayout')}
            >
              <option value="">No preference</option>
              {ROOM_LAYOUTS.map((layout) => (
                <option key={layout} value={layout}>
                  {humanise(layout)}
                </option>
              ))}
              <option value={OTHER_LAYOUT}>Other</option>
            </Select>
          </Field>

          <Field
            label="Layout notes"
            htmlFor="layoutNotes"
            errors={errors.layoutNotes}
            hint="If the layout you need isn't listed, describe it here."
          >
            <Textarea
              id="layoutNotes"
              rows={2}
              value={form.layoutNotes}
              onChange={(e) => set('layoutNotes', e.target.value)}
            />
          </Field>

          <Field
            label="Accessibility requirements"
            htmlFor="accessibilityRequirements"
            errors={errors.accessibilityRequirements}
            hint="Choose every one that applies. Anything else goes in the notes below."
          >
            <div id="accessibilityRequirements">
              <ChipGroup
                label="Accessibility requirements"
                options={ACCESSIBILITY_FEATURES}
                labels={ACCESSIBILITY_FEATURE_LABELS}
                values={form.accessibilityRequirements}
                onChange={(next) => set('accessibilityRequirements', next)}
              />
            </div>
          </Field>
          <Field
            label="Accessibility notes"
            htmlFor="accessibilityNotes"
            errors={errors.accessibilityNotes}
            hint="Describe anything not covered by the options above."
          >
            <Textarea
              id="accessibilityNotes"
              rows={2}
              value={form.accessibilityNotes}
              onChange={(e) => set('accessibilityNotes', e.target.value)}
            />
          </Field>

          {/* US-19 AC-3: the same list venues use, so suitability can compare them. */}
          <Field
            label="Required facilities"
            htmlFor="requiredFacilities"
            errors={errors.requiredFacilities}
            hint="What the venue itself must have. Portable equipment goes in equipment needs."
          >
            <div id="requiredFacilities">
              <ChipGroup
                label="Required facilities"
                options={FACILITIES}
                labels={FACILITY_LABELS}
                values={form.requiredFacilities}
                onChange={(next) => set('requiredFacilities', next)}
              />
            </div>
          </Field>

          <Field label="Equipment needs" htmlFor="equipmentNeeds" errors={errors.equipmentNeeds}>
            <Textarea
              id="equipmentNeeds"
              rows={2}
              value={form.equipmentNeeds}
              onChange={(e) => set('equipmentNeeds', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>
    </>
  );
}
