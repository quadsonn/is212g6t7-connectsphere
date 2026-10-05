import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import type { RegistrationView } from '@/types/api';
import { useRegister } from '../hooks/use-registrations';

const FIELDS = ['phone', 'dietaryRequirements', 'accessibilityNeeds'] as const;

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
  const [dietary, setDietary] = useState('');
  const [accessibility, setAccessibility] = useState('');
  const register = useRegister();

  const { byField, general } = fieldErrors(register.error, FIELDS);
  const refusal =
    register.isError && general.length === 0 && Object.keys(byField).length === 0
      ? apiErrorMessage(register.error, 'Could not register. Please try again.')
      : general.join(' ');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    register.mutate(
      {
        eventId,
        phone,
        // Empty optional fields are left out rather than sent as blanks.
        ...(dietary.trim() ? { dietaryRequirements: dietary } : {}),
        ...(accessibility.trim() ? { accessibilityNeeds: accessibility } : {}),
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
        hint="Your name and email are taken from your account."
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
        label="Dietary requirements"
        htmlFor={id('dietary')}
        errors={byField.dietaryRequirements}
      >
        <Textarea
          id={id('dietary')}
          rows={2}
          maxLength={500}
          value={dietary}
          onChange={(e) => setDietary(e.target.value)}
          aria-invalid={byField.dietaryRequirements ? true : undefined}
        />
      </Field>

      <Field
        label="Accessibility needs"
        htmlFor={id('access')}
        errors={byField.accessibilityNeeds}
      >
        <Textarea
          id={id('access')}
          rows={2}
          maxLength={500}
          value={accessibility}
          onChange={(e) => setAccessibility(e.target.value)}
          aria-invalid={byField.accessibilityNeeds ? true : undefined}
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
