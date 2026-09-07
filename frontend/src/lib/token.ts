import type { Role } from '@/types/api';

const TOKEN_KEY = 'connectsphere.token';
const EMAIL_KEY = 'connectsphere.email';

interface JwtClaims {
  sub: string;
  role: Role;
  jti: string;
  exp?: number;
}

/**
 * Decodes the JWT payload for routing purposes only.
 *
 * This is NOT verification — the signature is never checked here, and it must
 * not be treated as proof of anything. The server re-validates every request;
 * this only decides which dashboard to render.
 */
export function decodeToken(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;

    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as JwtClaims;

    return claims.sub && claims.role ? claims : null;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims): boolean {
  return typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now();
}

/**
 * Token storage.
 *
 * AMBIGUOUS / KNOWN TRADE-OFF: localStorage is readable by any script on the
 * origin, so a successful XSS can exfiltrate the token. The alternative — an
 * httpOnly cookie — needs the backend to set cookies and handle CSRF, which
 * it does not do today (it returns the token in the response body). Revisit
 * with the team before production.
 */
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  },
  /**
   * The API exposes no name or email (GET /auth/me returns userId, role, jti,
   * exp), so the shell shows the address typed at login. Cleared on logout.
   */
  getEmail: () => localStorage.getItem(EMAIL_KEY),
  setEmail: (email: string) => localStorage.setItem(EMAIL_KEY, email),
};
