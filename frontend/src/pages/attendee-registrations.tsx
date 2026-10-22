import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/form';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useMyRegistrations,
  useWithdraw,
} from '@/features/registrations/hooks/use-registrations';
import { apiErrorMessage } from '@/lib/api-client';
import { cn, formatDate, formatDateRange } from '@/lib/utils';

/**
 * US-35 / US-36 — the Attendee's registrations, with each event's current
 * details (read live, not copied at registration time), and withdrawal behind
 * an explicit confirmation step. Whether withdrawal is still allowed comes from
 * the server on every row; the server re-checks it when the request arrives.
 *
 * The server lists active registrations first and withdrawn ones below them,
 * so the order holds for any client. "Show withdrawn" only hides rows; it
 * never reorders them.
 */
export function AttendeeRegistrations() {
  const { data, isPending, isError, error } = useMyRegistrations();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showWithdrawn, setShowWithdrawn] = useState(true);
  const withdraw = useWithdraw();

  const all = data?.registrations ?? [];
  const withdrawnCount = all.filter((r) => r.status !== 'REGISTERED').length;
  const activeCount = all.length - withdrawnCount;
  const registrations = showWithdrawn ? all : all.filter((r) => r.status === 'REGISTERED');

  return (
    <>
      <PageHeader
        title="My registrations"
        description="Events you have registered for."
      />

      <Card>
        <CardHeader>
          <CardTitle>Registrations</CardTitle>
          {data ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-sm text-ink-500">
                {activeCount} registered
                {withdrawnCount > 0 ? ` · ${withdrawnCount} withdrawn` : ''}
              </span>
              {withdrawnCount > 0 ? (
                <CheckboxRow
                  id="show-withdrawn"
                  label="Show withdrawn"
                  checked={showWithdrawn}
                  onChange={setShowWithdrawn}
                />
              ) : null}
            </div>
          ) : null}
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load your registrations.')} />
          </CardContent>
        ) : null}

        {data && all.length === 0 ? (
          <EmptyState
            title={data.message ?? 'No Events Registered'}
            description="Register for an event from Browse events and it will appear here."
          />
        ) : null}

        {data && all.length > 0 && registrations.length === 0 ? (
          <EmptyState
            title="No active registrations"
            description={`Your ${withdrawnCount} withdrawn ${
              withdrawnCount === 1 ? 'registration is' : 'registrations are'
            } hidden.`}
            action={
              <Button size="sm" variant="secondary" onClick={() => setShowWithdrawn(true)}>
                Show withdrawn
              </Button>
            }
          />
        ) : null}

        {registrations.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {registrations.map((registration) => {
              const active = registration.status === 'REGISTERED';
              const confirming = confirmingId === registration.id;
              const { withdrawal, event } = registration;
              // US-02 AC-7: an Attendee may only open a CONFIRMED event. A past
              // (COMPLETED) or cancelled event's detail page 404s, so it is not
              // linked — the row still shows the registration, just not a
              // dead-end link into it.
              const openable = event.status === 'CONFIRMED';

              return (
                <li key={registration.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {openable ? (
                          <Link
                            to={`/events/${event.id}`}
                            className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
                          >
                            {event.name ?? 'Untitled event'}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink-900">
                            {event.name ?? 'Untitled event'}
                          </span>
                        )}
                        <Badge
                          srPrefix="Registration"
                          className={cn(
                            active
                              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                              : 'bg-ink-100 text-ink-600 ring-ink-200',
                          )}
                        >
                          {active ? 'Registered' : 'Withdrawn'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {formatDateRange(event.start, event.end)}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {event.venue
                          ? `${event.venue.name ?? 'Venue'}${
                              event.venue.location ? `, ${event.venue.location}` : ''
                            }`
                          : 'Venue to be confirmed'}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {active
                          ? `Registered ${formatDate(registration.registeredAt)}`
                          : registration.withdrawnAt
                            ? `Withdrawn ${formatDate(registration.withdrawnAt)}`
                            : 'Withdrawn'}
                      </p>
                      {active && withdrawal.withdrawalCutoffAt ? (
                        <p className="mt-1 text-xs text-ink-500">
                          You can withdraw until {formatDate(withdrawal.withdrawalCutoffAt)}.
                        </p>
                      ) : null}
                      {openable ? (
                        <Link
                          to={`/events/${event.id}`}
                          className="mt-1.5 inline-block text-xs font-medium text-brand-700 hover:underline"
                        >
                          View details →
                        </Link>
                      ) : null}
                    </div>

                    {active && !confirming ? (
                      <div className="shrink-0 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!withdrawal.canWithdraw}
                          onClick={() => {
                            withdraw.reset();
                            setConfirmingId(registration.id);
                          }}
                        >
                          Withdraw
                        </Button>
                        {!withdrawal.canWithdraw && withdrawal.reason ? (
                          <p className="mt-1.5 max-w-xs text-xs text-ink-500">
                            {withdrawal.reason}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {confirming ? (
                    <div className="mt-3 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                      <p className="text-sm text-red-900">
                        Withdraw from <strong>{event.name ?? 'this event'}</strong>? Your place
                        will be released for other attendees.
                      </p>
                      {withdraw.isError ? (
                        <ErrorState
                          message={apiErrorMessage(withdraw.error, 'Could not withdraw.')}
                        />
                      ) : null}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={withdraw.isPending}
                          onClick={() =>
                            withdraw.mutate(registration.id, {
                              onSuccess: () => setConfirmingId(null),
                            })
                          }
                        >
                          {withdraw.isPending ? 'Withdrawing…' : 'Yes, withdraw'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                          Keep my place
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
