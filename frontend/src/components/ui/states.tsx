import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Skeleton rows for a loading table. aria-busy is set by the caller. */
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-ink-100" />
      ))}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 p-8 text-sm text-ink-500">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 rounded-full bg-ink-100 p-3">
        <Inbox className="size-5 text-ink-500" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <p className="max-w-sm text-sm text-ink-500">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3',
        'text-sm text-red-900',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Marks a surface whose data comes from a mock service rather than the API.
 * Deliberately visible — nobody should mistake mocked data for real data in a
 * demo or a screenshot.
 */
export function MockDataNotice({ endpoint }: { endpoint: string }) {
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900"
    >
      <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Sample data — <code className="font-mono">{endpoint}</code> is not built yet.
      </span>
    </div>
  );
}
