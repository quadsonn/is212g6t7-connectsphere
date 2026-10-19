import { useEffect, useId, useRef } from 'react';

/**
 * A modal dialog: overlay, labelled panel, Escape to close, focus moved into
 * it on open. The same hand-rolled pattern as the organiser dashboard's
 * request dialog, without a new dependency.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4 py-6">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl focus:outline-none"
      >
        <div className="border-b border-ink-100 px-6 py-5">
          <h2 id={titleId} className="text-lg font-semibold text-ink-900">
            {title}
          </h2>
          {description ? <div className="mt-1 text-sm text-ink-600">{description}</div> : null}
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
