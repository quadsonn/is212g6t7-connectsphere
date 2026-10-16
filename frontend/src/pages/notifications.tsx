import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import {
  useMarkNotifications,
  useNotifications,
} from '@/features/notifications/hooks/use-notifications';
import { apiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Notifications page — the reader's own notifications, newest first, for
 * every role. Each shows its message, the reason where there is one, the
 * related event, and when; unread ones stand out. Clicking a notification
 * opens the related event's page for this role, where there is one, and marks
 * it read; each can also be marked read or unread without opening it. Polled
 * (see the hooks).
 */
export function NotificationsPage() {
  const { data: items, isPending, isError, error } = useNotifications();
  const { markRead, markUnread, markAllRead } = useMarkNotifications();
  const unread = (items ?? []).filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your events and requests."
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Mark all as read
          </Button>
        }
      />

      {isPending ? <LoadingState label="Loading notifications…" /> : null}
      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load your notifications.')} />
      ) : null}

      {items && items.length === 0 ? (
        <Card>
          <EmptyState title="No notifications yet" description="Updates about your events will appear here." />
        </Card>
      ) : null}

      {items && items.length > 0 ? (
        <Card>
          <ul className="divide-y divide-ink-100" aria-label="Notifications">
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'relative flex flex-wrap items-start gap-3 px-5 py-4',
                  !n.read && 'bg-brand-50/60',
                  // The whole box opens the event, when there is one.
                  n.link && 'cursor-pointer hover:bg-ink-50',
                )}
                aria-label={n.read ? undefined : 'Unread'}
              >
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  {n.link ? (
                    // Stretched link: its ::after covers the whole box, so a
                    // click anywhere opens the event. Opening it marks it read.
                    <Link
                      to={n.link}
                      onClick={() => {
                        if (!n.read) markRead.mutate(n.id);
                      }}
                      className={cn(
                        'text-ink-900 after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-600',
                        !n.read && 'font-semibold',
                      )}
                    >
                      {n.summary}
                    </Link>
                  ) : (
                    <p className={cn('text-ink-900', !n.read && 'font-semibold')}>{n.summary}</p>
                  )}
                  {n.reason ? (
                    <p className="text-ink-700">
                      <span className="font-medium">Reason:</span> {n.reason}
                    </p>
                  ) : null}
                  <p className="text-xs text-ink-500">
                    {n.relatedEvent ? `${n.relatedEvent.name ?? 'Untitled event'} · ` : ''}
                    {/* US-40 AC-3: venue activity names its venue. */}
                    {n.relatedBooking ? `${n.relatedBooking.venue.name ?? 'Unnamed venue'} · ` : ''}
                    <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                    {n.read ? '' : ' · Unread'}
                  </p>
                </div>
                {/* Above the stretched link, so it toggles without opening the event. */}
                <div className="relative z-10 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={markRead.isPending || markUnread.isPending}
                    onClick={() => (n.read ? markUnread.mutate(n.id) : markRead.mutate(n.id))}
                  >
                    {n.read ? 'Mark as unread' : 'Mark as read'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {markRead.error || markUnread.error || markAllRead.error ? (
        <div className="mt-4">
          <ErrorState
            message={apiErrorMessage(
              markRead.error ?? markUnread.error ?? markAllRead.error,
              'Could not update.',
            )}
          />
        </div>
      ) : null}
    </>
  );
}
