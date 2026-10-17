import { apiClient } from '@/lib/api-client';
import type { InboxNotification } from '@/types/api';

/** Notifications page — the logged-in user's own notifications. */
export const notificationsApi = {
  list: () => apiClient.get<InboxNotification[]>('/notifications').then((r) => r.data),

  unreadCount: () =>
    apiClient.get<{ unread: number }>('/notifications/unread-count').then((r) => r.data),

  markRead: (id: string) =>
    apiClient.patch<InboxNotification>(`/notifications/${id}/read`).then((r) => r.data),

  markUnread: (id: string) =>
    apiClient.patch<InboxNotification>(`/notifications/${id}/unread`).then((r) => r.data),

  markAllRead: () =>
    apiClient.patch<{ marked: number }>('/notifications/read-all').then((r) => r.data),
};
