import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/states';
import { ClarificationThread } from '@/features/events/components/clarification-thread';
import { EventRequestFields } from '@/features/events/components/event-request-fields';
import { useRespondToClarification } from '@/features/events/hooks/use-events';
import {
  EVENT_REQUEST_FIELDS,
  mapExistingToForm,
  toPayload,
  type EventRequestFormState,
  type SetEventRequestField,
} from '@/features/events/lib/event-request-form';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import type { EventRequestPayload, OrganiserRequestView } from '@/types/api';

/**
 * US-58 AC3 — only the fields the Organiser actually changed, so a response
 * never rewrites details they left alone. Compared as payloads, so a value
 * that round-trips through the form unchanged is not a change. A field emptied
 * in the form is left out, as the edit page does.
 */
function changedFields(
  form: EventRequestFormState,
  initial: EventRequestFormState,
): EventRequestPayload {
  const now = toPayload(form);
  const before = toPayload(initial);
  const changes: Record<string, unknown> = {};

  for (const key of Object.keys(now) as (keyof EventRequestPayload)[]) {
    if (now[key] !== undefined && JSON.stringify(now[key]) !== JSON.stringify(before[key])) {
      changes[key] = now[key];
    }
  }

  return changes as EventRequestPayload;
}

const RESPONSE_MAX = 4000;

/**
 * US-09 / US-58 — the Organiser's side of a clarification: the history, and
 * while a question is waiting, the reply form.
 *
 * AC2: write and send a response. AC3: optionally update the request's
 * details with it, behind the "Also change event details" toggle, using the
 * same fields as the edit page. AC5: sending it
 * returns the request to the Coordinator (`onResponded` lets the page react).
 * AC6: a blank response cannot be sent; the server refuses one too.
 */
export function ClarificationPanel({
  event,
  onResponded,
}: {
  event: OrganiserRequestView;
  onResponded?: () => void;
}) {
  const respond = useRespondToClarification();
  const [response, setResponse] = useState('');
  // AC6: once the Organiser has typed in or left the box, say why Send is off.
  const [touched, setTouched] = useState(false);
  const [editing, setEditing] = useState(false);
  const [initial] = useState(() => mapExistingToForm(event));
  const [form, setForm] = useState<EventRequestFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const awaiting = event.status === 'AWAITING_CLARIFICATION';
  const blank = response.trim() === '';
  const responseErrors = touched && blank ? ['Please write a response before sending.'] : [];
  // Once the AC6 message shows, it says the same thing as the hint.
  const showHint = blank && responseErrors.length === 0;

  function toggleEditing(on: boolean) {
    setEditing(on);
    // Turning it off drops the edits, so nothing hidden is sent.
    if (!on) {
      setForm(initial);
      setErrors({});
    }
  }

  const set: SetEventRequestField = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (blank) {
      setTouched(true);
      return;
    }

    setErrors({});
    setProblem(null);

    const changes = editing ? changedFields(form, initial) : {};
    respond.mutate(
      {
        id: event.id,
        response: response.trim(),
        ...(Object.keys(changes).length > 0 ? { changes } : {}),
      },
      {
        onSuccess: () => {
          setResponse('');
          setTouched(false);
          setEditing(false);
          onResponded?.();
        },
        onError: (error) => {
          // Changes are validated as a nested object, so their messages
          // arrive as "changes.<field> …".
          const mapped = fieldErrors(error, EVENT_REQUEST_FIELDS, 'changes.');
          setErrors(mapped.byField);
          if (Object.keys(mapped.byField).length > 0) setEditing(true);
          setProblem(
            mapped.general.length > 0
              ? mapped.general.join(' ')
              : Object.keys(mapped.byField).length > 0
                ? 'Please correct the highlighted details.'
                : apiErrorMessage(error, 'Could not send your response.'),
          );
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <ClarificationThread
        messages={event.clarifications ?? []}
        viewerId={event.organiserId}
        pendingLabel={awaiting ? 'Waiting for your reply' : undefined}
      />

      {awaiting ? (
        <form onSubmit={send} noValidate className="space-y-4">
          <Field
            label="Your response"
            htmlFor="clarification-response"
            required
            errors={responseErrors}
          >
            <Textarea
              id="clarification-response"
              rows={3}
              maxLength={RESPONSE_MAX}
              value={response}
              aria-invalid={responseErrors.length > 0 ? true : undefined}
              aria-describedby="clarification-response-meta"
              onChange={(e) => {
                setResponse(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              placeholder="Answer the coordinator's question"
            />
            <div
              id="clarification-response-meta"
              className="flex justify-between gap-3 text-xs text-ink-500"
            >
              <span>{showHint ? 'Write a response to send' : null}</span>
              <span aria-label={`${response.length} of ${RESPONSE_MAX} characters`}>
                {response.length}/{RESPONSE_MAX}
              </span>
            </div>
          </Field>

          <div className="space-y-3 rounded-lg border border-ink-200 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-ink-300"
                checked={editing}
                onChange={(e) => toggleEditing(e.target.checked)}
                aria-describedby="clarification-edit-help"
              />
              <span>
                <span className="font-medium text-ink-800">Also change event details</span>
                <span className="text-ink-500"> (optional)</span>
              </span>
            </label>
            <p id="clarification-edit-help" className="pl-6 text-xs text-ink-500">
              Any details you change here are sent with your response and shown to the
              coordinator in the history. Details you leave alone stay as they are.
            </p>
            {editing ? <EventRequestFields form={form} set={set} errors={errors} /> : null}
          </div>

          {problem ? <ErrorState message={problem} /> : null}

          <Button type="submit" disabled={respond.isPending || blank}>
            {respond.isPending ? 'Sending…' : 'Send response'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
