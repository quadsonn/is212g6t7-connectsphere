import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Wordmark } from '@/components/ui/logo';
import { ErrorState } from '@/components/ui/states';
import { HOME_BY_ROLE } from '@/components/layout/nav-config';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { apiErrorMessage } from '@/lib/api-client';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('reason') === 'session-expired'
      ? 'Your session has ended. Please sign in again.'
      : null,
  );
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const session = await signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? HOME_BY_ROLE[session.role], { replace: true });
    } catch (caught) {
      // The API returns one generic message for every credential failure
      // (US-01 AC-2) and a helpline message when locked out (AC-5). Surface
      // whatever it said rather than inventing our own wording.
      setError(apiErrorMessage(caught, 'Unable to sign in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-8" />

          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Access your ConnectSphere workspace.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            {error ? <ErrorState message={error} /> : null}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error !== null}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error !== null}
              />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>

            <p id="login-error" className="sr-only" aria-live="polite">
              {error ?? ''}
            </p>
          </form>
        </div>
      </div>

      {/* Brand panel — decorative, hidden from assistive tech. */}
      <div
        aria-hidden="true"
        className="hidden bg-brand-700 lg:flex lg:flex-col lg:justify-end lg:p-12"
      >
        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-snug text-white">
            Every event, from first request to final headcount.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-brand-200">
            ConnectSphere brings organisers, coordinators, venue teams and
            attendees into one coordinated workflow.
          </p>
        </div>
      </div>
    </div>
  );
}
