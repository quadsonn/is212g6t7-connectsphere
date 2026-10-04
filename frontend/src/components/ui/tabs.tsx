import { useRef } from 'react';

import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/**
 * WAI-ARIA tabs: arrow keys move between tabs, only the active tab is in the
 * tab order, and each tab controls a panel rendered by the caller with
 * <TabPanel>. Controlled, so the caller can keep the active tab in the URL.
 */
export function Tabs<T extends string>({
  idPrefix,
  label,
  tabs,
  active,
  onChange,
}: {
  idPrefix: string;
  label: string;
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (tab: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-ink-200">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(index, 1);
              if (e.key === 'ArrowLeft') move(index, -1);
            }}
            className={cn(
              '-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              selected
                ? 'border-brand-600 text-ink-900'
                : 'border-transparent text-ink-500 hover:text-ink-800',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  id,
  children,
}: {
  idPrefix: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className="pt-5 focus-visible:outline-none"
    >
      {children}
    </div>
  );
}
