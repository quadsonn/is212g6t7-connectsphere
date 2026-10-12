import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  ACCESSIBILITY_FEATURES,
  type AccessibilityFeature,
  type RegistrationView,
} from '@/types/api';
import { useRegister } from '../hooks/use-registrations';

const FIELDS = ['phone', 'accessibilityFeature', 'accessibilityNeeds'] as const;

/**
 * The dropdown's value for a need that is not on the list. Never sent to the
 * server: it only reveals the box where the Attendee describes their own
 * request, as on the Organiser's event form.
 */
const OTHER = 'OTHER';

/**
 * US-34 AC-2/AC-3 — the registration form. Name and email come from the
 * account, so only what the account lacks is asked for. Field errors from the
 * server (400) show against their input; a refusal such as "event is full" or
 * "registration is closed" (409) shows as a message above the buttons.
 */
export function RegisterForm({
  eventId,
  onRegistered,
  onCancel,
}: {
  eventId: string;
  onRegistered: (registration: RegistrationView) => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState('');
  // '' is none; otherwise a standard option, or OTHER for the Attendee's own.
  const [accessibility, setAccessibility] = useState('');
  const [accessibilityNotes, setAccessibilityNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const register = useRegister();

  const { byField, general } = fieldErrors(register.error, FIELDS);
  const refusal =
    register.isError && general.length === 0 && Object.keys(byField).length === 0
      ? apiErrorMessage(register.error, 'Could not register. Please try again.')
      : general.join(' ');

  // Choosing "Other" is a promise to describe it, so the description is needed.
  const describeOther =
    submitted && accessibility === OTHER && accessibilityNotes.trim() === ''
      ? ['Please describe your accessibility request.']
      : undefined;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (accessibility === OTHER && accessibilityNotes.trim() === '') return;

    register.mutate(
      {
        eventId,
        phone,
        // Empty optional fields are left out rather than sent as blanks.
        ...(accessibility !== '' && accessibility !== OTHER
          ? { accessibilityFeature: accessibility as AccessibilityFeature }
          : {}),
        ...(accessibilityNotes.trim() ? { accessibilityNeeds: accessibilityNotes } : {}),
      },
      { onSuccess: onRegistered },
    );
  };

  const id = (name: string) => `register-${eventId}-${name}`;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-4 w-full space-y-4 rounded-lg border border-ink-200 bg-ink-50 p-4"
    >
      <Field
        label="Phone number"
        htmlFor={id('phone')}
        required
        errors={byField.phone}
        hint="Include your country code, e.g. +65 9123 4567. Your name and email are taken from your account."
      >
        <Input
          id={id('phone')}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={byField.phone ? true : undefined}
          placeholder="+65 9123 4567"
        />
      </Field>

      <Field
        label="Accessibility needs"
        htmlFor={id('access')}
        errors={byField.accessibilityFeature}
        hint="Optional. Pick the closest match, or choose Other to describe your own."
      >
        <Select
          id={id('access')}
          value={accessibility}
          onChange={(e) => setAccessibility(e.target.value)}
          aria-invalid={byField.accessibilityFeature ? true : undefined}
        >
          <option value="">None</option>
          {ACCESSIBILITY_FEATURES.map((feature) => (
            <option key={feature} value={feature}>
              {ACCESSIBILITY_FEATURE_LABELS[feature]}
            </option>
          ))}
          <option value={OTHER}>Other</option>
        </Select>
      </Field>

      <Field
        label={accessibility === OTHER ? 'Describe your request' : 'Accessibility notes'}
        htmlFor={id('access-notes')}
        required={accessibility === OTHER}
        errors={describeOther ?? byField.accessibilityNeeds}
        hint={
          accessibility === OTHER
            ? undefined
            : 'Anything else we should know, beyond the option above.'
        }
      >
        <Textarea
          id={id('access-notes')}
          rows={2}
          maxLength={500}
          value={accessibilityNotes}
          onChange={(e) => setAccessibilityNotes(e.target.value)}
          aria-invalid={describeOther || byField.accessibilityNeeds ? true : undefined}
        />
      </Field>

      {refusal ? <ErrorState message={refusal} /> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={register.isPending}>
          {register.isPending ? 'Registering…' : 'Confirm registration'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
