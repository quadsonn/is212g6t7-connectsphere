import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Send } from 'lucide-react';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxRow, Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { useCreateEventRequest } from '@/features/events/hooks/use-events';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import {
  ACCESSIBILITY_FEATURES,
  ROOM_LAYOUTS,
  type AccessibilityFeature,
  type EventRequestPayload,
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
  proposedStart: string;
  proposedEnd: string;
  expectedAttendance: string;
  preferredLayout: string;
  layoutNotes: string;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string;
  equipmentNeeds: string;
  registrationEnabled: boolean;
}

const EMPTY: FormState = {
  name: '',
  purpose: '',
  description: '',
  category: '',
  proposedStart: '',
  proposedEnd: '',
  expectedAttendance: '',
  preferredLayout: '',
  layoutNotes: '',
  accessibilityRequirements: [],
  accessibilityNotes: '',
  equipmentNeeds: '',
  registrationEnabled: false,
};

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
    proposedStart: iso(form.proposedStart),
    proposedEnd: iso(form.proposedEnd),
    expectedAttendance:
      form.expectedAttendance.trim() === ''
        ? undefined
        : Number(form.expectedAttendance),
    preferredLayout: (text(form.preferredLayout) as RoomLayout) ?? undefined,
    layoutNotes: text(form.layoutNotes),
    accessibilityRequirements:
      form.accessibilityRequirements.length > 0
        ? form.accessibilityRequirements
        : undefined,
    accessibilityNotes: text(form.accessibilityNotes),
    equipmentNeeds: text(form.equipmentNeeds),
    registrationEnabled: form.registrationEnabled,
  };
}

export function OrganiserNewRequest() {
  const navigate = useNavigate();
  const { submit, saveDraft } = useCreateEventRequest();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pending = submit.isPending || saveDraft.isPending;

  const run = async (action: 'submit' | 'draft') => {
    setErrors({});
    setGeneral([]);
    setBanner(null);

    const mutation = action === 'submit' ? submit : saveDraft;

    try {
      await mutation.mutateAsync(toPayload(form));
      navigate('/organiser');
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

  return (
    <>
      <PageHeader
        title="New event request"
        description="Save as a draft while you gather details, or submit it for review."
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
            <CardTitle>When and how many</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="proposedStart" errors={errors.proposedStart} required>
              <Input
                id="proposedStart"
                type="datetime-local"
                value={form.proposedStart}
                onChange={(e) => set('proposedStart', e.target.value)}
                aria-invalid={invalid('proposedStart')}
              />
            </Field>

            <Field label="Ends" htmlFor="proposedEnd" errors={errors.proposedEnd} required>
              <Input
                id="proposedEnd"
                type="datetime-local"
                value={form.proposedEnd}
                onChange={(e) => set('proposedEnd', e.target.value)}
                aria-invalid={invalid('proposedEnd')}
              />
            </Field>

            <Field
              label="Expected attendance"
              htmlFor="expectedAttendance"
              errors={errors.expectedAttendance}
              required
              hint="Used later to check venue suitability."
            >
              <Input
                id="expectedAttendance"
                type="number"
                min={1}
                step={1}
                value={form.expectedAttendance}
                onChange={(e) => set('expectedAttendance', e.target.value)}
                aria-invalid={invalid('expectedAttendance')}
              />
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
            <span className="text-sm text-ink-500">Preferences, not blockers</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Preferred layout" htmlFor="preferredLayout" errors={errors.preferredLayout}>
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

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink-800">
                Accessibility requirements
              </legend>
              <div className="grid gap-0.5 sm:grid-cols-2">
                {ACCESSIBILITY_FEATURES.map((feature) => (
                  <CheckboxRow
                    key={feature}
                    id={`access-${feature}`}
                    label={humanise(feature)}
                    checked={form.accessibilityRequirements.includes(feature)}
                    onChange={(checked) =>
                      set(
                        'accessibilityRequirements',
                        checked
                          ? [...form.accessibilityRequirements, feature]
                          : form.accessibilityRequirements.filter((f) => f !== feature),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>

            <Field
              label="Accessibility notes"
              htmlFor="accessibilityNotes"
              errors={errors.accessibilityNotes}
              hint="Anything not covered by the options above."
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
            {submit.isPending ? 'Submitting…' : 'Submit for review'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void run('draft')}
          >
            <Save className="size-4" aria-hidden="true" />
            {saveDraft.isPending ? 'Saving…' : 'Save as draft'}
          </Button>

          <Button type="button" variant="ghost" onClick={() => navigate('/organiser')}>
            Cancel
          </Button>

          <p className="w-full text-xs text-ink-500">
            A draft can be saved with fields still empty. Submitting requires the
            starred fields.
          </p>
        </div>
      </form>
    </>
  );
}
