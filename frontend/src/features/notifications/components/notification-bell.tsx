import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useUnreadCount } from '../hooks/use-notifications';

/**
 * Notifications page — the bell in the shared header, for every role: a link
 * to the page, with the unread count (polled) when there is any.
 */
export function NotificationBell() {
  const { data } = useUnreadCount();
  const unread = data?.unread ?? 0;

  return (
    <Link
      to="/notifications"
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
    </Link>
  );
}
