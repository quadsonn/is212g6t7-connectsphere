import { useState } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2 } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import {
  useCommitReservation,
  useEquipmentCatalogue,
  useEventRequirements,
} from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { formatDateRange } from '@/lib/utils';
import type { EventStatus } from '@/types/api';

/**
 * US-32 — mirrors EQUIPMENT_COMMITTABLE_STATUSES on the server, which is what
 * actually enforces it: equipment cannot be committed to an event in one of
 * these statuses. (Drafts never reach this page — US-31 AC-4.)
 */
const NOT_COMMITTABLE: Partial<Record<EventStatus, string>> = {
  CANCELLED: 'This event has been cancelled, so equipment can’t be committed to it.',
  REJECTED: 'This event request was rejected, so equipment can’t be committed to it.',
  COMPLETED: 'This event has already taken place, so equipment can’t be committed to it.',
};

/**
 * US-31 (requirements) and US-32 (commit) — REAL data.
 *
 * GET /equipment/requirements/:eventId and POST /equipment/reservations.
 * The commit form does not repeat US-30's availability search: it links to
 * that page instead, and the server's own conflict check explains a refusal.
 */
export function EquipmentEventRequirements() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const { data: event, isPending, isError, error } = useEventRequirements(eventId);

  return (
    <>
      <PageHeader
        title={event?.name ?? 'Event requirements'}
        description="What support this event expects, and committing equipment to it."
        action={
          <LinkButton to="/equipment" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to events
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading requirements…" /> : null}

      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load this event’s requirements.')} />
      ) : null}

      {event ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
              <EventStatusBadge status={event.status} />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-600">
                {formatDateRange(event.proposedStart, event.proposedEnd)}
              </p>

              {event.hasRequirements ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    Equipment needs (from the Organiser)
                  </h3>
                  {/* US-31 AC-2: the request itself, in full. */}
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-900">
                    {event.organiserEquipmentNeeds}
                  </p>
                </div>
              ) : (
                // US-31 AC-3: clearly indicated, not blank.
                <p
                  role="note"
                  className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700"
                >
                  {event.message}
                </p>
              )}
            </CardContent>
          </Card>

          {NOT_COMMITTABLE[event.status] ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Commit equipment</CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  role="note"
                  className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700"
                >
                  {NOT_COMMITTABLE[event.status]}
                </p>
              </CardContent>
            </Card>
          ) : event.proposedStart && event.proposedEnd ? (
            <CommitForm
              eventId={event.eventId}
              start={event.proposedStart}
              end={event.proposedEnd}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** US-32 — commit a quantity of one item to this event for its date and time. */
function CommitForm({ eventId, start, end }: { eventId: string; start: string; end: string }) {
  const [equipmentId, setEquipmentId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const catalogue = useEquipmentCatalogue();
  const commit = useCommitReservation();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentId) return;
    commit.mutate({ eventId, equipmentId, quantity: Number(quantity) });
  };

  const availabilityLink = `/equipment/availability?${new URLSearchParams({
    start,
    end,
    ...(equipmentId ? { equipmentId } : {}),
    quantity,
  }).toString()}`;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Commit equipment</CardTitle>
        <LinkButton to={availabilityLink} variant="secondary" size="sm">
          <CalendarClock className="size-4" aria-hidden="true" />
          Check availability
        </LinkButton>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-ink-600">
            Locks the quantity to this event for {formatDateRange(start, end)}.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Equipment item" htmlFor="commit-item" required>
              <Select
                id="commit-item"
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
              >
                <option value="">Choose equipment…</option>
                {catalogue.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.type}
                    {item.location ? ` — ${item.location}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" htmlFor="commit-quantity" required>
              <Input
                id="commit-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </div>

          {catalogue.isError ? (
            <ErrorState message={apiErrorMessage(catalogue.error, 'Could not load the catalogue.')} />
          ) : null}

          {/* US-32 AC-3: the server's reason, shown as given. */}
          {commit.isError ? (
            <ErrorState message={apiErrorMessage(commit.error, 'Could not commit the equipment.')} />
          ) : null}

          {commit.data ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              Committed {commit.data.quantity} × {commit.data.equipment.type} for{' '}
              {formatDateRange(commit.data.start, commit.data.end)}.
            </div>
          ) : null}

          <Button type="submit" disabled={!equipmentId || commit.isPending}>
            {commit.isPending ? 'Committing…' : 'Commit to this event'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
