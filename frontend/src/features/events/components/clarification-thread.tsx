import { CHANGE_FIELD_LABELS, formatChangeValue } from '@/features/events/lib/change-format';
import type { ClarificationMessage } from '@/types/api';

/**
 * US-09 AC-5 / US-58 AC4 — the clarification history, oldest first: each
 * question and answer with who wrote it and when, and beside a response the
 * request details it updated (old -> new). Shown to the Organiser and to the
 * Coordinator alike.
 */
export function ClarificationThread({ messages }: { messages: ClarificationMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-ink-500">No clarification messages yet.</p>;
  }

  return (
    <ol aria-label="Clarification history" className="space-y-3 border-l border-ink-200 pl-4">
      {messages.map((message) => (
        <li key={message.id} className="space-y-1.5 text-sm">
          <p className="whitespace-pre-line text-ink-800">{message.body}</p>
          <p className="text-xs text-ink-500">
            {message.author.name} · {new Date(message.createdAt).toLocaleString()}
          </p>

          {message.change && message.change.changes.length > 0 ? (
            <div className="rounded-md bg-ink-50 px-3 py-2">
              <p className="text-xs font-medium text-ink-700">Updated details</p>
              <table className="mt-1 w-full text-left text-xs">
                <thead className="sr-only">
                  <tr>
                    <th>Field</th>
                    <th>Previous</th>
                    <th>New</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {message.change.changes.map((change) => (
                    <tr key={change.field}>
                      <td className="py-0.5 pr-3 font-medium text-ink-800">
                        {CHANGE_FIELD_LABELS[change.field] ?? change.field}
                      </td>
                      <td className="whitespace-pre-line py-0.5 pr-3 text-ink-500 line-through decoration-ink-300">
                        {formatChangeValue(change.field, change.previous)}
                      </td>
                      <td className="whitespace-pre-line py-0.5 text-ink-900">
                        {formatChangeValue(change.field, change.next)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
