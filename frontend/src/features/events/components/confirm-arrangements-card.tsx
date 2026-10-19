import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import type { ReadinessItem } from '@/types/api';
import { useConfirmArrangements, useConfirmationReadiness } from '../hooks/use-events';

const ITEM_ICON: Record<ReadinessItem['status'], React.ReactNode> = {
  OK: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />,
  MISSING: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />,
  NEEDS_MANUAL_CHECK: (
    <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
  ),
};

/** Read out with each item, so the state is not carried by the icon alone. */
const ITEM_STATUS_TEXT: Record<ReadinessItem['status'], string> = {
  OK: 'Ready',
  MISSING: 'Outstanding',
  NEEDS_MANUAL_CHECK: 'Needs a manual check',
};

/**
 * US-42 — the assigned Coordinator confirms the event's arrangements, sending
 * it on to the safety check. The button stays disabled until the server says
 * every venue booking and equipment line is ready (AC-1); the checklist below
 * says what is still missing (AC-2). The server re-checks on Confirm, so a
 * stale checklist can never confirm an event that is no longer ready.
 */
export function ConfirmArrangementsCard({ eventId }: { eventId: string }) {
  const readiness = useConfirmationReadiness(eventId);
  const confirm = useConfirmArrangements(eventId);
  const [asking, setAsking] = useState(false);

  const items = readiness.data?.items ?? [];
  const outstanding = items.filter((item) => item.status !== 'OK');
  const ready = readiness.data?.ready ?? false;

  const onConfirm = () =>
    confirm.mutate(undefined, {
      onSuccess: () => {
        setAsking(false);
        toast.success('Arrangements confirmed. The event is now awaiting its safety review.');
      },
      onError: () => {
        setAsking(false);
        // Something changed since the checklist loaded; show what it is now.
        void readiness.refetch();
      },
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm arrangements</CardTitle>
        <Button
          type="button"
          size="sm"
          disabled={!ready || confirm.isPending}
          onClick={() => setAsking(true)}
        >
          Confirm arrangements
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {readiness.isPending ? <LoadingState label="Checking arrangements…" /> : null}
        {readiness.error ? (
          <ErrorState message={apiErrorMessage(readiness.error, 'Could not check the arrangements.')} />
        ) : null}
        {confirm.error ? (
          <ErrorState message={apiErrorMessage(confirm.error, 'Could not confirm the arrangements.')} />
        ) : null}

        {readiness.data ? (
          <>
            <p className="text-sm text-ink-600">
              {ready
                ? 'Every venue booking is approved and the equipment is in place. Confirming sends the event to the Safety Officer for review.'
                : `${outstanding.length} ${outstanding.length === 1 ? 'thing needs' : 'things need'} sorting out before you can confirm.`}
            </p>
            <ul className="space-y-2" aria-label="Arrangements checklist">
              {items.map((item) => (
                <li key={`${item.kind}-${item.label}`} className="flex items-start gap-2 text-sm">
                  {ITEM_ICON[item.status]}
                  <span className={item.status === 'OK' ? 'text-ink-700' : 'font-medium text-ink-900'}>
                    <span className="sr-only">{ITEM_STATUS_TEXT[item.status]}: </span>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </CardContent>

      {asking ? (
        <Dialog
          title="Confirm arrangements?"
          description="The event moves to “Arrangements confirmed - awaiting safety review” and the Organiser is told. The Safety Officer reviews it next."
          onClose={() => setAsking(false)}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAsking(false)}
                disabled={confirm.isPending}
              >
                Cancel
              </Button>
              <Button type="button" onClick={onConfirm} disabled={confirm.isPending}>
                {confirm.isPending ? 'Confirming…' : 'Confirm'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            You can't edit the event's planning details once it is waiting for its safety review.
          </p>
        </Dialog>
      ) : null}
    </Card>
  );
}
