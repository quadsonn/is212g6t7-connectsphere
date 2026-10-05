import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/** A labelled field with inline validation messaging. */
export function Field({
  label,
  htmlFor,
  errors,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const hasError = (errors?.length ?? 0) > 0;
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}

      {children}

      {hasError ? (
        <ul id={errorId} className="space-y-0.5 text-xs text-red-700">
          {errors!.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm',
        'text-ink-900 placeholder:text-ink-400',
        'focus:border-brand-600 focus:outline-2 focus:outline-offset-0 focus:outline-brand-600',
        'aria-[invalid=true]:border-red-500',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative h-10 w-full', className)}>
      <select
        className={cn(
          'absolute inset-0 h-full w-full appearance-none rounded-lg border border-ink-300 bg-white pl-3 pr-9 text-sm text-ink-900',
          'focus:border-brand-600 focus:outline-2 focus:outline-offset-0 focus:outline-brand-600',
          'aria-[invalid=true]:border-red-500',
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden="true"
      />
    </div>
  );
}

export function CheckboxRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-50"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-ink-300 text-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600"
      />
      <span className="text-sm text-ink-800">{label}</span>
    </label>
  );
}

/**
 * A multi-select over a fixed vocabulary, as wrapping toggle chips. Shared by
 * the venue form and venue search (US-18) so both offer exactly the same
 * values in the same order. Each chip is a toggle button (aria-pressed), so
 * the selection is announced and keyboard-operable without a checkbox column.
 */
export function ChipGroup<T extends string>({
  label,
  options,
  labels,
  values,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  values: readonly T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = values.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                selected
                  ? values.filter((v) => v !== option)
                  : // Kept in vocabulary order, whatever order they were picked.
                    options.filter((o) => o === option || values.includes(o)),
              )
            }
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              selected
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
            )}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
