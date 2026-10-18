import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { POLL_MS } from '@/lib/polling';
import type { InboxNotification } from '@/types/api';
import { notificationsApi } from '../api/notifications.api';

/** How often the bell and the page check for new notifications. */
export const NOTIFICATIONS_POLL_MS = POLL_MS;

/** How many the page shows (the API's most per page), and the bell's dropdown. */
export const PAGE_SIZE = 100;
export const DROPDOWN_SIZE = 10;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  recent: ['notifications', 'recent'] as const,
  unread: ['notifications', 'unread'] as const,
};

/** The reader's notifications, newest first; polled while the page is open. */
export function useNotifications() {
  return useQuery<InboxNotification[]>({
    queryKey: notificationKeys.list,
    queryFn: () => notificationsApi.list({ limit: PAGE_SIZE }),
    staleTime: 0,
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });
}

/** US-40 — the newest few, for the bell's dropdown; polled only while it is open. */
export function useRecentNotifications(enabled: boolean) {
  return useQuery<InboxNotification[]>({
    queryKey: notificationKeys.recent,
    queryFn: () => notificationsApi.list({ limit: DROPDOWN_SIZE }),
    enabled,
    staleTime: 0,
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });
}

/** The bell's unread count; polled on every screen. */
export function useUnreadCount() {
  return useQuery<{ unread: number }>({
    queryKey: notificationKeys.unread,
    queryFn: notificationsApi.unreadCount,
    staleTime: 0,
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });
}

/** Mark one read or unread, or all read — then refresh the list and the bell. */
export function useMarkNotifications() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: refresh,
  });
  const markUnread = useMutation({
    mutationFn: (id: string) => notificationsApi.markUnread(id),
    onSuccess: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: refresh,
  });

  return { markRead, markUnread, markAllRead };
}
