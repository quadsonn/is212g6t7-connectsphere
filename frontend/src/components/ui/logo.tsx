import { cn } from '@/lib/utils';

/**
 * ConnectSphere mark: two overlapping rings on a rounded field.
 *
 * The overlap is the idea — two parties (organiser and venue, attendee and
 * event) meeting in a shared space. It reads at 24px, works in one colour,
 * and needs no text to be recognisable in the top bar.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      role="img"
      aria-label="ConnectSphere"
    >
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <circle cx="13" cy="16" r="6.5" className="fill-none stroke-white" strokeWidth="2" />
      <circle cx="19" cy="16" r="6.5" className="fill-none stroke-accent-300" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-ink-900">
        Connect<span className="text-brand-600">Sphere</span>
      </span>
    </span>
  );
}
