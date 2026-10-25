import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/app-shell';
import { NAV_BY_ROLE } from '@/components/layout/nav-config';
import { tokenStore } from '@/lib/token';
import { LoginPage } from '@/pages/login-page';
import type { Role } from '@/types/api';
import { authApi } from './api/auth.api';
import { AuthContext, AuthProvider, type AuthSession } from './auth-context';
import { ProtectedRoute } from './components/protected-route';
import { useAuth } from './hooks/use-auth';

/**
 * UI tests for US-01 (Log in securely) and US-02 (Role-appropriate access):
 * the login screen, the route guard, signing out and the role's menu,
 * rendered with React Testing Library. The API is mocked; the integration
 * tests (test/auth.e2e-spec.ts, test/access-control.e2e-spec.ts) and the
 * browser tests (e2e/us01-login.spec.ts, e2e/us02-role-access.spec.ts)
 * cover the server side.
 */

vi.mock('./api/auth.api', () => ({
  authApi: { login: vi.fn(), logout: vi.fn(), me: vi.fn(), permissions: vi.fn() },
}));
// The bell polls notifications; it is not part of what these tests check.
vi.mock('@/features/notifications/components/notification-bell', () => ({
  NotificationBell: () => null,
}));

const api = vi.mocked(authApi);

/** An unsigned JWT with the claims the app reads (sub, role, jti). */
const tokenFor = (role: Role, sub = 'USR-006') => {
  const part = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, role, jti: 'j1' })}.signature`;
};

const http401 = (message: string) =>
  new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    data: { statusCode: 401, message },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

/** Shows where the router ended up, so a redirect can be asserted. */
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderWithSession = (session: AuthSession | null, path: string, routes: React.ReactNode) =>
  render(
    <QueryClientProvider client={client()}>
      <AuthContext.Provider
        value={{ session, isAuthenticated: session !== null, signIn: vi.fn(), signOut: vi.fn() }}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>{routes}</Routes>
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

const sessionOf = (role: Role): AuthSession => ({ userId: 'USR-006', role, email: 'user@example.com' });

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('US-01 AC-1/AC-2: the login screen', () => {
  const renderLogin = () =>
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  const fillAndSubmit = async (email: string, password: string) => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
  };

  // TC-S1-64 · US-01 AC-1 · fails if a successful sign-in did not keep the session or did not open the role's dashboard
  // Code: AuthProvider.signIn stores the token; LoginPage navigates to HOME_BY_ROLE[role].
  it('Given valid credentials, Then it stores the session and opens the role’s dashboard', async () => {
    api.login.mockResolvedValue({ accessToken: tokenFor('EVENT_COORDINATOR', 'USR-004') });

    renderLogin();
    await fillAndSubmit('coord.a@example.com', 'correct-horse-battery-staple');

    expect(await screen.findByTestId('where')).toHaveTextContent('/coordinator');
    expect(api.login).toHaveBeenCalledWith({
      email: 'coord.a@example.com',
      password: 'correct-horse-battery-staple',
    });
    expect(tokenStore.get()).toBe(tokenFor('EVENT_COORDINATOR', 'USR-004'));
  });

  // TC-S1-64 · US-01 AC-2 · fails if a rejected login showed a field-specific error, left the page, or kept a token
  // Code: the 401 body's message is shown through ErrorState (role="alert"); signIn throws before storing anything.
  it('Given wrong credentials, Then it shows the generic error, stays on the login page and stores no session', async () => {
    api.login.mockRejectedValue(http401('invalid email or password'));

    renderLogin();
    await fillAndSubmit('organiser@example.com', 'wrong-password');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid email or password/i);
    expect(alert).not.toHaveTextContent(/password is wrong|unknown email|no such user/i);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });

  // TC-S1-65 · US-01 AC-4 · fails if a session ended by the server was not explained on the login page
  // Code: the axios 401 interceptor sends the user to /login?reason=session-expired; LoginPage reads it.
  it('Given the session ended, Then the login page says so', () => {
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={['/login?reason=session-expired']}>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your session has ended. Please sign in again.');
  });
});

describe('US-01 AC-3 and US-02 AC-8: protected pages need a session', () => {
  // TC-S1-58 · US-01 AC-3, US-02 AC-8 · fails if a protected page rendered without a session
  // Code: ProtectedRoute <Navigate>s to /login when useAuth() has no session.
  it('Given no session, When a protected page is opened directly, Then it redirects to /login and renders nothing protected', () => {
    renderWithSession(
      null,
      '/organiser',
      <>
        <Route element={<ProtectedRoute />}>
          <Route path="/organiser" element={<p>Organiser data</p>} />
        </Route>
        <Route path="/login" element={<p>Login screen</p>} />
      </>,
    );

    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Organiser data')).not.toBeInTheDocument();
  });
});

describe('US-01 AC-4: signing out', () => {
  function SignOutButton() {
    const { session, signOut } = useAuth();
    return (
      <>
        <p>{session ? 'signed in' : 'signed out'}</p>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </>
    );
  }

  const renderSignedIn = () => {
    tokenStore.set(tokenFor('EVENT_ORGANISER'));
    tokenStore.setEmail('organiser@example.com');
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <AuthProvider>
            <SignOutButton />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  // TC-S1-65 · US-01 AC-4 · fails if signing out did not revoke the token on the server or kept it in the browser
  // Code: signOut() calls POST /auth/logout, then clears the stored token and the session.
  it('Given a signed-in user, When they sign out, Then the server is told and the stored session is cleared', async () => {
    api.logout.mockResolvedValue(undefined);
    renderSignedIn();
    expect(screen.getByText('signed in')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('signed out')).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
    expect(tokenStore.getEmail()).toBeNull();
  });

  // TC-S1-65 · US-01 AC-4 · fails if a failed logout call left the user signed in
  // Code: signOut()'s finally block clears the session even when the logout request fails.
  it('Given the logout call fails, Then the session still ends locally', async () => {
    api.logout.mockRejectedValue(http401('token revoked'));
    renderSignedIn();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('signed out')).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });
});

describe('US-02 AC-3/AC-4: only the role’s own screens and menus', () => {
  // TC-S1-75 · US-02 AC-3 · fails if a signed-in user could open another role's screen by URL
  // Code: ProtectedRoute allow={[role]} sends any other role to "/" (their own home).
  it('Given an Organiser, When they open a Coordinator page by URL, Then they are sent back to their own home', () => {
    renderWithSession(
      sessionOf('EVENT_ORGANISER'),
      '/coordinator',
      <>
        <Route element={<ProtectedRoute allow={['EVENT_COORDINATOR']} />}>
          <Route path="/coordinator" element={<p>Coordinator data</p>} />
        </Route>
        <Route path="/" element={<p>Home</p>} />
      </>,
    );

    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    expect(screen.queryByText('Coordinator data')).not.toBeInTheDocument();
  });

  // TC-S1-75 · US-02 AC-4 · fails if a role's menu showed another role's items, or missed one of its own
  // Code: AppShell renders NAV_BY_ROLE[session.role] and nothing else.
  it.each([
    ['EVENT_ORGANISER', ['My requests']],
    ['EVENT_COORDINATOR', ['My events', 'Change requests', 'My venue requests', 'Venues']],
    ['VENUE_STAFF', ['Venue catalogue', 'Related events', 'Booking requests', 'Availability calendar']],
    ['ATTENDEE', ['Browse events', 'My registrations']],
  ] as [Role, string[]][])('Given a %s, Then the menu shows exactly %j', (role, labels) => {
    renderWithSession(
      sessionOf(role),
      '/',
      <Route element={<AppShell />}>
        <Route path="/" element={<p>Home</p>} />
      </Route>,
    );

    // The side nav (desktop); the top strip repeats the same items for phones.
    const [sideNav] = screen.getAllByRole('navigation', { name: 'Main' }).slice(-1);
    const shown = within(sideNav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(shown).toEqual(labels);

    const everyOtherLabel = Object.entries(NAV_BY_ROLE)
      .filter(([other]) => other !== role)
      .flatMap(([, items]) => items.map((item) => item.label))
      .filter((label) => !labels.includes(label));
    for (const label of everyOtherLabel) {
      expect(within(sideNav).queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });
});
