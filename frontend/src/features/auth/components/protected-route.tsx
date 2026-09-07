import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/use-auth';
import type { Role } from '@/types/api';

/**
 * Mirrors the backend's default-deny (US-02): no session means no screen.
 *
 * This is a usability measure, not a security boundary — the API enforces
 * every rule server-side regardless of what the client renders.
 */
export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allow && !allow.includes(session.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
