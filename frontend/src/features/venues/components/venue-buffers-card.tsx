import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { fieldErrors } from '@/lib/api-client';
import type { Venue } from '@/types/api';
import { MAX_BUFFER_MINUTES, bufferError, bufferSummary } from '../buffers';
import { useUpdateVenueBuffers } from '../hooks/use-venues';

const FIELDS = ['setupMinutes', 'turnaroundMinutes'] as const;
type BufferField = (typeof FIELDS)[number];

/**
 * US-49 — a venue's setup and turnaround time.
 *
 * Everyone who can see the venue sees the saved values; only the Venue Staff
 * member who manages it (AC-4) gets the edit form.
 */
export function VenueBuffersCard({ venue }: { venue: Venue }) {
  const { session } = useAuth();
  const isManager = session?.userId != null && session.userId === venue.managedById;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-800">{bufferSummary(venue)}</p>
      <p className="text-xs text-ink-500">
        The venue is treated as occupied for this long before and after every event.
      </p>
      {isManager ? <BuffersForm venue={venue} /> : null}
    </div>
  );
}

function BuffersForm({ venue }: { venue: Venue }) {
  const update = useUpdateVenueBuffers(venue.id);
  const [values, setValues] = useState<Record<BufferField, string>>({
    setupMinutes: String(venue.setupMinutes),
    turnaroundMinutes: String(venue.turnaroundMinutes),
  });
  const [errors, setErrors] = useState<Partial<Record<BufferField, string[]>>>({});
  const [general, setGeneral] = useState<string[]>([]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setGeneral([]);

    const clientErrors: Partial<Record<BufferField, string[]>> = {};
    for (const field of FIELDS) {
      const message = bufferError(values[field]);
      if (message) clientErrors[field] = [message];
    }
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    update.mutate(
      {
        setupMinutes: Number(values.setupMinutes),
        turnaroundMinutes: Number(values.turnaroundMinutes),
      },
      {
        onSuccess: (saved) => toast.success(`Buffer times saved. ${bufferSummary(saved)}.`),
        onError: (error) => {
          const { byField, general: rest } = fieldErrors(error, FIELDS);
          setErrors(byField);
          setGeneral(rest.length > 0 || Object.keys(byField).length > 0 ? rest : ['Could not save the buffer times.']);
        },
      },
    );
  };

  const input = (field: BufferField, label: string) => (
    <Field label={label} htmlFor={`venue-${field}`} errors={errors[field]}>
      <Input
        id={`venue-${field}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_BUFFER_MINUTES}
        step={1}
        value={values[field]}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={errors[field] ? `venue-${field}-error` : undefined}
        onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {input('setupMinutes', 'Setup time (minutes)')}
        {input('turnaroundMinutes', 'Turnaround time (minutes)')}
      </div>
      {general.length > 0 ? (
        <ul role="alert" className="space-y-0.5 text-xs text-red-700">
          {general.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save buffer times'}
      </Button>
    </form>
  );
}
