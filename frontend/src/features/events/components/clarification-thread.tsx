import { ArrowRight } from 'lucide-react';

import { CHANGE_FIELD_LABELS, formatChangeValue } from '@/features/events/lib/change-format';
import { cn, formatMessageTime } from '@/lib/utils';
import type { ClarificationMessage, Role } from '@/types/api';

/** Each side of the conversation keeps its own colour down the left edge. */
const ROLE_BORDER: Partial<Record<Role, string>> = {
  EVENT_ORGANISER: 'border-emerald-400',
  EVENT_COORDINATOR: 'border-brand-400',
  EVENT_COORDINATOR_LEAD: 'border-brand-400',
};

/**
 * US-09 AC-5 / US-58 AC4 — the clarification history, oldest first: each
 * question and answer with who wrote it and when, and under a response the
 * request details it updated (old → new). Shown to the Organiser and to the
 * Coordinator alike.
 *
 * `viewerId` names the reader's own messages "You". `pendingLabel`, when set,
 * marks the last message as the question still waiting for an answer.
 */
export function ClarificationThread({
  messages,
  viewerId,
  pendingLabel,
}: {
  messages: ClarificationMessage[];
  viewerId?: string;
  pendingLabel?: string;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-ink-500">No clarification messages yet.</p>;
  }

  const last = messages[messages.length - 1];
  // Only a question can be waiting: the Organiser's own reply ends the round.
  const pendingId = pendingLabel && last.author.role !== 'EVENT_ORGANISER' ? last.id : null;

  return (
    <ol aria-label="Clarification history" className="space-y-3">
      {messages.map((message) => {
        const pending = message.id === pendingId;
        return (
          <li
            key={message.id}
            aria-current={pending ? 'true' : undefined}
            className={cn(
              'space-y-1.5 border-l-4 py-1 pl-3 text-sm',
              ROLE_BORDER[message.author.role] ?? 'border-ink-300',
              pending && 'rounded-r-md border-amber-400 bg-amber-50 py-2',
            )}
          >
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
              <span className="font-medium text-ink-800">
                {message.author.id === viewerId ? 'You' : message.author.name}
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
              {pending ? (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 font-medium text-amber-900">
                  {pendingLabel}
                </span>
              ) : null}
            </p>
            <p className="whitespace-pre-line text-ink-800">{message.body}</p>

            {message.change && message.change.changes.length > 0 ? (
              <div className="rounded-md bg-ink-50 px-3 py-2">
                <p className="text-xs font-medium text-ink-700">Updated details</p>
                <table className="mt-1 text-left text-xs">
                  <thead className="sr-only">
                    <tr>
                      <th>Field</th>
                      <th>Previous</th>
                      <th />
                      <th>New</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {message.change.changes.map((change) => (
                      <tr key={change.field}>
                        <td className="py-0.5 pr-3 font-medium text-ink-800">
                          {CHANGE_FIELD_LABELS[change.field] ?? change.field}
                        </td>
                        <td className="whitespace-pre-line py-0.5 text-ink-500 line-through decoration-ink-300">
                          {formatChangeValue(change.field, change.previous)}
                        </td>
                        <td className="w-6 py-0.5 text-center text-ink-400">
                          <ArrowRight className="inline size-3" aria-hidden="true" />
                        </td>
                        <td className="whitespace-pre-line py-0.5 font-medium text-ink-900">
                          {formatChangeValue(change.field, change.next)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
