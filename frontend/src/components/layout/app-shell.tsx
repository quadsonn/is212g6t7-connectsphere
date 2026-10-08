import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { Wordmark } from '@/components/ui/logo';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { cn } from '@/lib/utils';
import { NAV_BY_ROLE } from './nav-config';
import { SidebarSlotContext } from './sidebar-slot-context';
import { UserMenu } from './user-menu';

/** Top bar + role-adaptive left nav, shared by every authenticated screen. */
export function AppShell() {
  const { session } = useAuth();
  const items = session ? NAV_BY_ROLE[session.role] : [];
  // Page-provided sidebar content (see SidebarPortal).
  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);
  const [slotActive, setSlotActive] = useState(false);
  const slot = useMemo(() => ({ node: slotNode, setActive: setSlotActive }), [slotNode]);

  return (
    <div className="min-h-screen bg-ink-50">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-10 border-b border-ink-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <UserMenu />
        </div>
      </header>

      {/*
        Below md the side nav is hidden, so the same items scroll horizontally
        under the header — otherwise no screen past the role's home page is
        reachable on a phone (US-16 AC-7, the responsive design requirement).
      */}
      <nav aria-label="Main" className="overflow-x-auto border-b border-ink-200 bg-white md:hidden">
        <ul className="flex gap-1 px-4 py-2">
          {items
            .filter((item) => !item.comingSoon)
            .map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                      isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>

      <div className="mx-auto flex max-w-[90rem] gap-6 px-4 py-6 sm:px-6">
        {/* With page content in it, the sidebar widens and scrolls on its own,
            so a long filter list never pushes the page around. */}
        <aside
          className={cn(
            'hidden shrink-0 md:block',
            slotActive
              ? 'sticky top-22 w-72 self-start max-h-[calc(100vh-7rem)] overflow-y-auto pr-1'
              : 'w-56',
          )}
        >
          <nav aria-label="Main">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.to}>
                  {item.comingSoon ? (
                    <span
                      aria-disabled="true"
                      title="Not built yet"
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-400"
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                      <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
                    </span>
                  ) : (
                    <NavLink
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-50 text-brand-800'
                            : 'text-ink-700 hover:bg-ink-100',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div ref={setSlotNode} />
        </aside>

        <main id="main" className="min-w-0 flex-1">
          <SidebarSlotContext.Provider value={slot}>
            <Outlet />
          </SidebarSlotContext.Provider>
        </main>
      </div>
    </div>
  );
}

/** Page heading used by every dashboard, so titles stay consistent. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
