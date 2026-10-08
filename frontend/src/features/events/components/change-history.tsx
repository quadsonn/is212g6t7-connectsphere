import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { useEventHistory } from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import { humanise } from '@/lib/utils';
import {
  ARRANGEMENT_LABELS,
  CHANGE_FIELD_LABELS,
  formatChangeValue,
} from '../lib/change-format';

/**
 * US-26 — the event's change history, oldest first (AC-1). Each entry shows
 * what changed with its previous and new value, who, and when (AC-2); an event
 * with no changes says so (AC-3). Changes flagged under US-25 AC-2 are marked.
 */
export function ChangeHistory({ eventId }: { eventId: string }) {
  const { data, isPending, isError, error } = useEventHistory(eventId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change history</CardTitle>
        {data && data.entries.length > 0 ? (
          <span className="text-sm text-ink-500">
            {data.entries.length} change{data.entries.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {isPending ? <LoadingState label="Loading history…" /> : null}

        {isError ? (
          <ErrorState message={apiErrorMessage(error, 'Could not load the change history.')} />
        ) : null}

        {data && data.entries.length === 0 ? (
          <p className="text-sm text-ink-500">{data.message}</p>
        ) : null}

        {data && data.entries.length > 0 ? (
          <ol className="space-y-5 border-l border-ink-200 pl-4">
            {data.entries.map((entry) => (
              <li key={entry.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span>
                    {entry.changedBy.name} ({humanise(entry.changedBy.role)})
                  </span>
                  {entry.requiresReview ? (
                    <Badge className="bg-amber-50 text-amber-900 ring-amber-400">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      Requires review
                    </Badge>
                  ) : null}
                </div>

                {entry.requiresReview ? (
                  <p className="text-xs text-amber-900">
                    Affects: {entry.affectedArrangements.map((a) => ARRANGEMENT_LABELS[a]).join(', ')}
                  </p>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Field</th>
                        <th className="py-1 pr-3 font-medium">Previous</th>
                        <th className="py-1 font-medium">New</th>
                      </tr>
                    </thead>
                    <tbody className="align-top">
                      {entry.changes.map((change) => (
                        <tr key={change.field} className="border-t border-ink-100">
                          <td className="py-1.5 pr-3 font-medium text-ink-800">
                            {CHANGE_FIELD_LABELS[change.field] ?? change.field}
                          </td>
                          <td className="whitespace-pre-line py-1.5 pr-3 text-ink-500 line-through decoration-ink-300">
                            {formatChangeValue(change.field, change.previous)}
                          </td>
                          <td className="whitespace-pre-line py-1.5 text-ink-900">
                            {formatChangeValue(change.field, change.next)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}
