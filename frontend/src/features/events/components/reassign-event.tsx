import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { ErrorState, LoadingState } from '@/components/ui/states';
import {
  useReassignEvent,
  useReassignmentCandidates,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';

type Step = 'idle' | 'selecting' | 'confirming';

/**
 * US-27 — the responsible Coordinator hands their event to a colleague.
 *
 * Three steps, matching the ACs: request reassignment, select the new
 * Coordinator (AC-1), then confirm (AC-2). Nothing is sent until the last
 * step. On success the Coordinator no longer has access to the event, so
 * they are returned to their queue with a notice.
 */
export function ReassignEvent({ eventId, eventName }: { eventId: string; eventName: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('idle');
  const [selectedId, setSelectedId] = useState('');
  const candidates = useReassignmentCandidates(eventId, step !== 'idle');
  const reassign = useReassignEvent(eventId);

  const selected = candidates.data?.find((c) => c.id === selectedId);

  function cancel() {
    setStep('idle');
    setSelectedId('');
    reassign.reset();
  }

  function confirm() {
    reassign.mutate(selectedId, {
      onSuccess: () =>
        navigate('/coordinator', {
          state: {
            notice: `"${eventName}" has been reassigned to ${selected?.name}. You have both been notified.`,
          },
        }),
    });
  }

  if (step === 'idle') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <p className="text-sm text-ink-500">
          No longer available to manage this event? Hand it to another coordinator.
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={() => setStep('selecting')}>
          Request reassignment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-ink-100 pt-3">
      {candidates.isPending ? <LoadingState label="Loading coordinators…" /> : null}
      {candidates.isError ? (
        <ErrorState message={apiErrorMessage(candidates.error, 'Could not load coordinators.')} />
      ) : null}

      {candidates.data && candidates.data.length === 0 ? (
        <p className="text-sm text-ink-500">There are no other coordinators to hand this event to.</p>
      ) : null}

      {candidates.data && candidates.data.length > 0 && step === 'selecting' ? (
        <Field label="New coordinator" htmlFor="reassign-coordinator" required>
          <Select
            id="reassign-coordinator"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Select a coordinator</option>
            {candidates.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {step === 'confirming' && selected ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Reassign <strong>{eventName}</strong> to <strong>{selected.name}</strong>? You will no
          longer manage this event. You and {selected.name} will both be notified, and the change
          will be recorded in the event's history.
        </div>
      ) : null}

      {reassign.error ? (
        <p className="text-sm text-red-700">
          {apiErrorMessage(reassign.error, 'Could not reassign this event.')}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={cancel}>
          Cancel
        </Button>
        {step === 'selecting' ? (
          <Button
            type="button"
            size="sm"
            disabled={!selected}
            onClick={() => setStep('confirming')}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={reassign.isPending} onClick={confirm}>
            {reassign.isPending ? 'Reassigning…' : 'Confirm reassignment'}
          </Button>
        )}
      </div>
    </div>
  );
}
