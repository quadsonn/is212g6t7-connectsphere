import { useSyncExternalStore } from 'react';

/** Whether a CSS media query currently matches, kept in sync as it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `md` breakpoint — where AppShell's sidebar becomes visible. */
export const SIDEBAR_BREAKPOINT = '(min-width: 768px)';
