import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Send } from 'lucide-react';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxRow, Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import {
  useCreateEventRequest,
  useMyRequest,
  useUpdateEventRequest,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { ATTENDANCE_BANDS } from '@/lib/attendance-bands';
import { EDITABLE_EVENT_STATUSES } from '@/lib/status';
import {
  ACCESSIBILITY_FEATURES,
  ROOM_LAYOUTS,
  type AccessibilityFeature,
  type EventRequestPayload,
  type OrganiserRequestView,
  type RoomLayout,
} from '@/types/api';
import { humanise } from '@/lib/utils';

/** Every field the server may return an error against (US-03 AC-3). */
const FIELDS = [
  'name',
  'purpose',
  'description',
  'category',
  'proposedStart',
  'proposedEnd',
  'expectedAttendance',
  'preferredLayout',
  'layoutNotes',
  'accessibilityRequirements',
  'accessibilityNotes',
  'equipmentNeeds',
] as const;

interface FormState {
  name: string;
  purpose: string;
  description: string;
  category: string;
  proposedStartDate: string;
  proposedStartTime: string;
  proposedEndDate: string;
  proposedEndTime: string;
  expectedAttendance: string;
  preferredLayout: string;
  layoutNotes: string;
  accessibilityRequirements: string;
  accessibilityNotes: string;
  equipmentNeeds: string;
  registrationEnabled: boolean;
}

/**
 * Bookable start/end times run 6:00 AM–11:30 PM in 30-minute blocks, matching
 * venue operating hours — there is no support for booking an event overnight.
 */
function buildTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  for (let minutes = 6 * 60; minutes < 24 * 60; minutes += 30) {
    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const period = hours24 < 12 ? 'AM' : 'PM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    slots.push({ value, label: `${hours12}:${String(mins).padStart(2, '0')} ${period}` });
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

/**
 * The start time list stops half an hour earlier than the end time list —
 * starting at 11:30 PM would leave no room for an event before the 12:00 AM
 * venue cutoff.
 */
const START_TIME_SLOTS = TIME_SLOTS.slice(0, -1);

/**
 * Combines the separate date and time inputs into the "YYYY-MM-DDTHH:mm"
 * shape `iso()` expects. Date and time are kept as independent form fields
 * (rather than one merged string) so picking one doesn't get wiped out while
 * the other is still unset.
 */
function combineDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

/** The inverse of combineDateTime — splits a stored ISO instant back into the
 * local date and time-of-day the two inputs show, for prefilling an edit. */
function isoToLocalParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * UI-only sentinel for "none of the listed layouts fit" — not a RoomLayout
 * value the backend recognises (US-06 AC-2: the actual description belongs in
 * layoutNotes). Selecting it clears preferredLayout from the payload rather
 * than sending it, since @IsEnum(RoomLayout) would reject anything else.
 */
const OTHER_LAYOUT = 'OTHER';

/** Same idea for accessibility: 'Other' is described in accessibilityNotes. */
const OTHER_ACCESS = 'OTHER';

const EMPTY: FormState = {
  name: '',
  purpose: '',
  description: '',
  category: '',
  proposedStartDate: '',
  proposedStartTime: '',
  proposedEndDate: '',
  proposedEndTime: '',
  expectedAttendance: '',
  preferredLayout: '',
  layoutNotes: '',
  accessibilityRequirements: '',
  accessibilityNotes: '',
  equipmentNeeds: '',
  registrationEnabled: false,
};

/** Prefills the form from a stored request, for editing a draft or a RETURNED request. */
function mapExistingToForm(existing: OrganiserRequestView): FormState {
  const start = isoToLocalParts(existing.proposedStart);
  const end = isoToLocalParts(existing.proposedEnd);

  return {
    name: existing.name ?? '',
    purpose: existing.purpose ?? '',
    description: existing.description ?? '',
    category: existing.category ?? '',
    proposedStartDate: start.date,
    proposedStartTime: start.time,
    proposedEndDate: end.date,
    proposedEndTime: end.time,
    expectedAttendance:
      existing.expectedAttendance != null ? String(existing.expectedAttendance) : '',
    preferredLayout: existing.preferredLayout ?? '',
    layoutNotes: existing.layoutNotes ?? '',
    accessibilityRequirements: existing.accessibilityRequirements[0] ?? '',
    accessibilityNotes: existing.accessibilityNotes ?? '',
    equipmentNeeds: existing.equipmentNeeds ?? '',
    registrationEnabled: existing.registrationEnabled,
  };
}

/**
 * Converts the form to the API payload.
 *
 * Empty strings are omitted rather than sent: a draft may legitimately leave a
 * field unset (US-04 AC-1), and sending "" would be a value rather than an
 * absence. `datetime-local` gives local wall-clock time, so it is converted to
 * ISO before sending.
 */
function toPayload(form: FormState): EventRequestPayload {
  const text = (value: string) => (value.trim() === '' ? undefined : value.trim());
  const iso = (value: string) =>
    value === '' ? undefined : new Date(value).toISOString();

  return {
    name: text(form.name),
    purpose: text(form.purpose),
    description: text(form.description),
    category: text(form.category),
    proposedStart: iso(combineDateTime(form.proposedStartDate, form.proposedStartTime)),
    proposedEnd: iso(combineDateTime(form.proposedEndDate, form.proposedEndTime)),
    expectedAttendance:
      form.expectedAttendance.trim() === ''
        ? undefined
        : Number(form.expectedAttendance),
    preferredLayout:
      form.preferredLayout === OTHER_LAYOUT
        ? undefined
        : ((text(form.preferredLayout) as RoomLayout) ?? undefined),
    layoutNotes: text(form.layoutNotes),
    accessibilityRequirements:
      form.accessibilityRequirements === '' ||
      form.accessibilityRequirements === OTHER_ACCESS
        ? undefined
        : [form.accessibilityRequirements as AccessibilityFeature],
    accessibilityNotes: text(form.accessibilityNotes),
    equipmentNeeds: text(form.equipmentNeeds),
    registrationEnabled: form.registrationEnabled,
  };
}

/**
 * Doubles as both "New event request" (US-03/US-04) and "Edit request"
 * (US-04 AC-2, US-08) — the fields are identical, and keeping one form means
 * validation and layout cannot drift between the two. Route with an :id
 * param (`/organiser/:id/edit`) puts it in edit mode; `/organiser/new` puts
 * it in create mode.
 */
export function OrganiserNewRequest() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const { submit: createSubmit, saveDraft } = useCreateEventRequest();
  const { saveChanges, submit: editSubmit } = useUpdateEventRequest(id ?? '');
  const {
    data: existing,
    isPending: loadingExisting,
    isError: loadFailed,
    error: loadError,
  } = useMyRequest(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  // Prefill once the existing request arrives — guarded so a background
  // refetch (e.g. after saving) doesn't clobber what the Organiser is typing.
  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setForm(mapExistingToForm(existing));
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pending = isEdit
    ? editSubmit.isPending || saveChanges.isPending
    : createSubmit.isPending || saveDraft.isPending;

  const run = async (action: 'submit' | 'draft') => {
    setErrors({});
    setGeneral([]);
    setBanner(null);

    const mutation = isEdit
      ? action === 'submit'
        ? editSubmit
        : saveChanges
      : action === 'submit'
        ? createSubmit
        : saveDraft;

    try {
      await mutation.mutateAsync(toPayload(form));
      navigate(isEdit ? `/organiser/${id}` : '/organiser');
    } catch (error) {
      // The API flags every offending field at once; show each against its
      // own input rather than as one wall of text.
      const mapped = fieldErrors(error, FIELDS);
      setErrors(mapped.byField);
      setGeneral(mapped.general);

      if (Object.keys(mapped.byField).length === 0 && mapped.general.length === 0) {
        setBanner(apiErrorMessage(error, 'Could not save the request.'));
      } else {
        setBanner('Please correct the highlighted fields.');
      }
    }
  };

  const invalid = (field: string) => (errors[field] ? true : undefined);

  if (isEdit && loadingExisting) {
    return (
      <>
        <PageHeader title="Edit event request" description="Loading your request…" />
        <LoadingState label="Loading request…" />
      </>
    );
  }

  if (isEdit && loadFailed) {
    return (
      <>
        <PageHeader title="Edit event request" description="Loading your request…" />
        <ErrorState message={apiErrorMessage(loadError, 'Could not load this request.')} />
      </>
    );
  }

  if (isEdit && existing && !EDITABLE_EVENT_STATUSES.includes(existing.status)) {
    return (
      <>
        <PageHeader title="Edit event request" description={existing.name ?? 'Untitled draft'} />
        <ErrorState
          message={`This request is ${humanise(existing.status)} and can no longer be edited.`}
        />
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={() => navigate(`/organiser/${id}`)}>
            Back to request
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit event request' : 'New event request'}
        description={
          isEdit
            ? 'Update your draft, then save your changes or submit it for review.'
            : 'Save as a draft while you gather details, or submit it for review.'
        }
      />

      <form
        className="max-w-3xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run('submit');
        }}
        noValidate
      >
        {banner ? <ErrorState message={banner} /> : null}

        {general.length > 0 ? (
          <ErrorState message={general.join(' ')} />
        ) : null}

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
                <Input
                  id="proposedStartDate"
                  type="date"
                  className="flex-1"
                  value={form.proposedStartDate}
                  onChange={(e) => set('proposedStartDate', e.target.value)}
                  aria-invalid={invalid('proposedStart')}
                />
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
                <Input
                  id="proposedEndDate"
                  type="date"
                  className="flex-1"
                  value={form.proposedEndDate}
                  onChange={(e) => set('proposedEndDate', e.target.value)}
                  aria-invalid={invalid('proposedEnd')}
                />
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
              hint={
                form.accessibilityRequirements === OTHER_ACCESS
                  ? 'Please describe the accessibility requirements you need in the notes below.'
                  : undefined
              }
            >
              <Select
                id="accessibilityRequirements"
                value={form.accessibilityRequirements}
                onChange={(e) => set('accessibilityRequirements', e.target.value)}
                aria-invalid={invalid('accessibilityRequirements')}
              >
                <option value="">None</option>
                {ACCESSIBILITY_FEATURES.map((feature) => (
                  <option key={feature} value={feature}>
                    {humanise(feature)}
                  </option>
                ))}
                <option value={OTHER_ACCESS}>Other</option>
              </Select>
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

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Send className="size-4" aria-hidden="true" />
            {(isEdit ? editSubmit.isPending : createSubmit.isPending)
              ? 'Submitting…'
              : 'Submit for review'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void run('draft')}
          >
            <Save className="size-4" aria-hidden="true" />
            {(isEdit ? saveChanges.isPending : saveDraft.isPending)
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : 'Save as draft'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(isEdit ? `/organiser/${id}` : '/organiser')}
          >
            Cancel
          </Button>

          <p className="w-full text-xs text-ink-500">
            {isEdit
              ? 'You can save your changes at any point. Submitting for review requires all starred fields to be completed.'
              : 'You can save a draft with fields left empty. Submitting for review requires all starred fields to be completed.'}
          </p>
        </div>
      </form>
    </>
  );
}
