import { createContext, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { decodeToken, isExpired, tokenStore } from '@/lib/token';
import type { Role } from '@/types/api';
import { authApi } from './api/auth.api';

export interface AuthSession {
  userId: string;
  role: Role;
  email: string | null;
}

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<AuthSession>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Rebuilds the session from a stored token, discarding it if expired. */
function readStoredSession(): AuthSession | null {
  const token = tokenStore.get();
  if (!token) return null;

  const claims = decodeToken(token);
  if (!claims || isExpired(claims)) {
    tokenStore.clear();
    return null;
  }

  return {
    userId: claims.sub,
    role: claims.role,
    email: tokenStore.getEmail(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readStoredSession);
  const queryClient = useQueryClient();

  const signIn = useCallback(async (email: string, password: string) => {
    const { accessToken } = await authApi.login({ email, password });

    const claims = decodeToken(accessToken);
    if (!claims) {
      throw new Error('The server returned a token we could not read.');
    }

    tokenStore.set(accessToken);
    // The API exposes no name/email, so the shell shows what was typed here.
    tokenStore.setEmail(email);

    const next: AuthSession = { userId: claims.sub, role: claims.role, email };
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Best-effort: the backend revokes the token's jti (US-01 AC-4).
      await authApi.logout();
    } catch {
      // An expired or already-revoked token still ends the session locally.
    } finally {
      tokenStore.clear();
      setSession(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ session, isAuthenticated: session !== null, signIn, signOut }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
