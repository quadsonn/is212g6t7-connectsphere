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
    <select
      className={cn(
        'h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900',
        'focus:border-brand-600 focus:outline-2 focus:outline-offset-0 focus:outline-brand-600',
        'aria-[invalid=true]:border-red-500',
        className,
      )}
      {...props}
    />
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
 * A multi-select over a fixed vocabulary, as a column of checkboxes. Shared by
 * the venue form and venue search (US-18) so both offer exactly the same
 * values in the same order.
 */
export function CheckboxGroup<T extends string>({
  idPrefix,
  options,
  labels,
  values,
  onChange,
  className,
}: {
  idPrefix: string;
  options: readonly T[];
  labels: Record<T, string>;
  values: readonly T[];
  onChange: (next: T[]) => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      {options.map((option) => (
        <CheckboxRow
          key={option}
          id={`${idPrefix}-${option}`}
          label={labels[option]}
          checked={values.includes(option)}
          onChange={(checked) =>
            onChange(
              checked
                ? // Kept in vocabulary order, whatever order they were ticked.
                  options.filter((o) => o === option || values.includes(o))
                : values.filter((v) => v !== option),
            )
          }
        />
      ))}
    </div>
  );
}
