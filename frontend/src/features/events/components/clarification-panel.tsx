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

/**
 * US-09 / US-58 — the Organiser's side of a clarification: the history, and
 * while a question is waiting, the reply form.
 *
 * AC2: write and send a response. AC3: optionally update the request's
 * details with it, using the same fields as the edit page. AC5: sending it
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
  const [editing, setEditing] = useState(false);
  const [initial] = useState(() => mapExistingToForm(event));
  const [form, setForm] = useState<EventRequestFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const awaiting = event.status === 'AWAITING_CLARIFICATION';

  const set: SetEventRequestField = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (response.trim() === '') return;

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
      <ClarificationThread messages={event.clarifications ?? []} />

      {awaiting ? (
        <form onSubmit={send} noValidate className="space-y-4">
          <Field label="Your response" htmlFor="clarification-response" required>
            <Textarea
              id="clarification-response"
              rows={3}
              maxLength={4000}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Answer the coordinator's question"
            />
          </Field>

          {editing ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Change any details the coordinator asked about. Only what you change is updated.
              </p>
              <EventRequestFields form={form} set={set} errors={errors} />
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Update request details
            </Button>
          )}

          {problem ? <ErrorState message={problem} /> : null}

          <div className="flex gap-3">
            <Button type="submit" disabled={respond.isPending || response.trim() === ''}>
              {respond.isPending ? 'Sending…' : 'Send response'}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                disabled={respond.isPending}
                onClick={() => {
                  setEditing(false);
                  setForm(initial);
                  setErrors({});
                }}
              >
                Keep details as they are
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
