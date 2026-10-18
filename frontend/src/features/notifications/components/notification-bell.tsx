import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import type { InboxNotification } from '@/types/api';
import {
  useMarkNotifications,
  useRecentNotifications,
  useUnreadCount,
} from '../hooks/use-notifications';
import { notificationTitle } from '../notification-title';

/**
 * The bell in the shared header, for every role: the unread count (polled on
 * every screen), and — US-40 — a dropdown of the newest notifications, newest
 * first. Each shows its venue and event, what happened and when; opening one
 * marks it read and goes to its link (for Venue Staff, the booking request).
 * "View all" leads to the full notifications page.
 *
 * Hand-rolled like UserMenu (outside click and Escape close it): the app has
 * no popover component and this avoids a new dependency.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data } = useUnreadCount();
  const unread = data?.unread ?? 0;
  const recent = useRecentNotifications(open);
  const { markRead, markAllRead } = useMarkNotifications();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openItem = (n: InboxNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const items = recent.data ?? [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex size-10 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-5 text-white"
            aria-hidden="true"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-20 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-ink-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={unread === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all as read
            </Button>
          </div>

          {recent.isPending ? (
            <p className="px-4 py-6 text-center text-sm text-ink-500">Loading…</p>
          ) : recent.isError ? (
            <p className="px-4 py-6 text-center text-sm text-red-700">Could not load notifications.</p>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink-900">No notifications yet</p>
              <p className="mt-1 text-xs text-ink-500">Updates about your events and venues will appear here.</p>
            </div>
          ) : (
            <ul className="max-h-[24rem] divide-y divide-ink-100 overflow-y-auto" aria-label="Recent notifications">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-ink-50',
                      !n.read && 'bg-brand-50/60',
                    )}
                  >
                    <span
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className={cn('block text-ink-900', !n.read && 'font-semibold')}>
                        {notificationTitle(n.type) ?? n.summary}
                      </span>
                      {notificationTitle(n.type) ? (
                        <span className="block text-ink-700">{n.summary}</span>
                      ) : null}
                      <span className="block truncate text-xs text-ink-500">
                        {[n.relatedEvent?.name, n.relatedBooking?.venue.name].filter(Boolean).join(' · ')}
                        {n.relatedEvent || n.relatedBooking ? ' · ' : ''}
                        <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                      </span>
                    </span>
                    {n.read ? null : <span className="sr-only">Unread</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-ink-100 px-4 py-2 text-right">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
