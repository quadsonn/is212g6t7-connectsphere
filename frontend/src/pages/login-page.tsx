import { useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { ParticleSphere } from '@/components/ui/particle-sphere';
import { HOME_BY_ROLE } from '@/components/layout/nav-config';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { apiErrorMessage } from '@/lib/api-client';

/**
 * A self-contained mark for this page only — deliberately not the shared
 * `Wordmark` component, which appears to hardcode a dark text color for
 * light backgrounds (it's unreadable against the dark hero). Two
 * overlapping rings echo the "connect" idea without depending on any
 * external asset.
 */
function BrandMark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <defs>
          <linearGradient id="brandmark-gradient" x1="0" y1="0" x2="34" y2="34">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <circle cx="13" cy="17" r="9" fill="none" stroke="url(#brandmark-gradient)" strokeWidth="2.5" />
        <circle cx="21" cy="17" r="9" fill="none" stroke="url(#brandmark-gradient)" strokeWidth="2.5" opacity="0.55" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">
        <span className="text-white">Connect</span>
        <span className="bg-gradient-to-r from-indigo-300 to-pink-400 bg-clip-text text-transparent">
          Sphere
        </span>
      </span>
    </div>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const loginRef = useRef<HTMLDivElement>(null);
  const scrollToLogin = () =>
    loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
      setError(apiErrorMessage(caught, 'Unable to sign in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative bg-[#0B0A1E]">
      {/* Fixed, not absolute: stays in place behind both sections as the page scrolls. */}
      <ParticleSphere className="fixed inset-0 z-0" pointCount={5000} />

      <div className="relative z-10">
        {/* Hero */}
        <section className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
          <BrandMark />
          <div className="max-w-lg">
            <h1 className="text-3xl font-semibold leading-snug text-white sm:text-4xl">
              Event planning, made easy.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
              ConnectSphere brings organisers, coordinators, venue staffs and
              attendees together on one platform.
            </p>
          </div>
          <Button size="lg" onClick={scrollToLogin}>
            Log in
          </Button>
        </section>

        {/* Sign in */}
        <section
          ref={loginRef}
          className="flex min-h-screen items-center justify-center px-6 py-12"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Sign in</h2>
            <p className="mt-1.5 text-sm text-white/60">
              Access your ConnectSphere workspace.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
              {error ? <ErrorState message={error} /> : null}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-white/80">
                  Email address
                </Label>
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
                <Label htmlFor="password" className="text-white/80">
                  Password
                </Label>
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
        </section>
      </div>
    </div>
  );
}