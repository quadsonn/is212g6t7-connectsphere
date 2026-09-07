import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  /** Announced to screen readers ahead of the label, e.g. "Status: Draft". */
  srPrefix?: string;
}

export function Badge({ children, className, srPrefix }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
        'text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        className,
      )}
    >
      {srPrefix ? <span className="sr-only">{srPrefix}: </span> : null}
      {children}
    </span>
  );
}
