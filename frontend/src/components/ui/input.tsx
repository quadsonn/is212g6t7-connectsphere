import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm',
        'text-ink-900 placeholder:text-ink-400',
        'focus:border-brand-600 focus:outline-2 focus:outline-offset-0 focus:outline-brand-600',
        'aria-[invalid=true]:border-red-500 aria-[invalid=true]:outline-red-500',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-sm font-medium text-ink-800', className)}
      {...props}
    />
  );
}
