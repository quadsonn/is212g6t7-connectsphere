import axios from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { fieldErrors } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type { BufferClash, BufferPreview, Venue, VenueBuffersPayload } from '@/types/api';
import { MAX_BUFFER_MINUTES, bufferError, bufferSummary } from '../buffers';
import { usePreviewVenueBuffers, useUpdateVenueBuffers } from '../hooks/use-venues';

const FIELDS = ['setupMinutes', 'turnaroundMinutes'] as const;
type BufferField = (typeof FIELDS)[number];

/**
 * US-49 — a venue's setup and turnaround time.
 *
 * Everyone who can see the venue sees the saved values; only the Venue Staff
 * member who manages it (AC-4) gets the edit form. US-51: saving previews
 * the clashes first and asks before flagging any booking.
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
  const preview = usePreviewVenueBuffers(venue.id);
  const update = useUpdateVenueBuffers(venue.id);
  const [values, setValues] = useState<Record<BufferField, string>>({
    setupMinutes: String(venue.setupMinutes),
    turnaroundMinutes: String(venue.turnaroundMinutes),
  });
  const [errors, setErrors] = useState<Partial<Record<BufferField, string[]>>>({});
  const [general, setGeneral] = useState<string[]>([]);
  // US-51: the clashes awaiting "Cancel" or "Save anyway", and what to save.
  const [review, setReview] = useState<{ clashes: BufferClash[]; payload: VenueBuffersPayload } | null>(null);
  const busy = preview.isPending || update.isPending;

  const showError = (error: unknown) => {
    const { byField, general: rest } = fieldErrors(error, FIELDS);
    setErrors(byField);
    setGeneral(rest.length > 0 || Object.keys(byField).length > 0 ? rest : ['Could not save the buffer times.']);
  };

  const save = (payload: VenueBuffersPayload, confirmConflicts = false) =>
    update.mutate(confirmConflicts ? { ...payload, confirmConflicts } : payload, {
      onSuccess: (saved) => {
        setReview(null);
        toast.success(
          saved.flagged > 0
            ? `Saved. ${saved.flagged} ${saved.flagged === 1 ? 'booking' : 'bookings'} flagged for review.`
            : `Buffer times saved. ${bufferSummary(saved)}.`,
        );
      },
      onError: (error) => {
        // Bookings changed since the preview: show the up-to-date list.
        if (axios.isAxiosError<BufferPreview>(error) && error.response?.status === 409) {
          setReview({ clashes: error.response.data.clashes ?? [], payload });
          return;
        }
        setReview(null);
        showError(error);
      },
    });

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

    const payload = {
      setupMinutes: Number(values.setupMinutes),
      turnaroundMinutes: Number(values.turnaroundMinutes),
    };

    // US-51 AC-3: check for clashes before saving anything.
    preview.mutate(payload, {
      onSuccess: ({ clashes }) => (clashes.length > 0 ? setReview({ clashes, payload }) : save(payload)),
      onError: showError,
    });
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
    <>
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
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save buffer times'}
        </Button>
      </form>

      {review ? (
        <BufferClashDialog
          clashes={review.clashes}
          saving={update.isPending}
          onCancel={() => setReview(null)}
          onConfirm={() => save(review.payload, true)}
        />
      ) : null}
    </>
  );
}

/**
 * US-51 AC-3/AC-4 — the bookings the new buffers would put in conflict, with
 * what each clashes with. "Save anyway" saves and flags them; "Cancel" saves
 * nothing. Bookings are never moved or cancelled either way (AC-6).
 */
function BufferClashDialog({
  clashes,
  saving,
  onCancel,
  onConfirm,
}: {
  clashes: BufferClash[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      title="Existing bookings would clash"
      description="With these buffer times, the bookings below would overlap. Save anyway to keep them as they are and flag them “Conflict – needs review”."
      onClose={onCancel}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Save anyway'}
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-500">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Event</th>
              <th scope="col" className="py-2 pr-4 font-medium">Time</th>
              <th scope="col" className="py-2 font-medium">Clashes with</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {clashes.map((clash) => (
              <tr key={`${clash.bookingId}-${clash.clashesWith.bookingId}`}>
                <td className="py-2 pr-4 font-medium text-ink-900">{clash.eventName ?? 'Untitled event'}</td>
                <td className="py-2 pr-4 text-ink-700">{formatDateRange(clash.start, clash.end)}</td>
                <td className="py-2 text-ink-700">
                  {clash.clashesWith.eventName ?? 'Untitled event'}
                  <span className="block text-xs text-ink-500">
                    {formatDateRange(clash.clashesWith.start, clash.clashesWith.end)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
