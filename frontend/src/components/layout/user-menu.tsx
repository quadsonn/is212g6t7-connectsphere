import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ROLE_THEME } from '@/lib/role-theme';
import { cn, humanise, initialsFrom } from '@/lib/utils';

export function UserMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!session) return null;

  const label = session.email ?? humanise(session.role);
  const theme = ROLE_THEME[session.role];
  const roleBadge = (
    <span
      className={cn(
        'mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-medium ring-1 ring-inset',
        theme.badge,
      )}
    >
      {humanise(session.role)}
    </span>
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink-100"
      >
        <span
          aria-hidden="true"
          className={cn('grid size-8 place-items-center rounded-full text-xs font-semibold', theme.avatar)}
        >
          {initialsFrom(label)}
        </span>
        <span className="hidden sm:block">
          <span className="block max-w-[14rem] truncate text-sm font-medium text-ink-900">
            {label}
          </span>
          {roleBadge}
        </span>
        <ChevronDown className="size-4 text-ink-500" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-ink-200 bg-white p-1.5 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink-900">{label}</p>
            {roleBadge}
          </div>
          <div className="my-1 h-px bg-ink-200" />
          <Button
            variant="ghost"
            size="sm"
            role="menuitem"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  );
}
