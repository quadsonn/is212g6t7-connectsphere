import { apiClient } from '@/lib/api-client';
import type {
  CurrentUser,
  LoginRequest,
  LoginResponse,
  PermissionsResponse,
} from '@/types/api';

/** All real endpoints — POST /auth/login, POST /auth/logout, GET /auth/me[/permissions]. */
export const authApi = {
  login: (body: LoginRequest) =>
    apiClient.post<LoginResponse>('/auth/login', body).then((r) => r.data),

  logout: () => apiClient.post<void>('/auth/logout').then((r) => r.data),

  me: () => apiClient.get<CurrentUser>('/auth/me').then((r) => r.data),

  permissions: () =>
    apiClient.get<PermissionsResponse>('/auth/me/permissions').then((r) => r.data),
};
