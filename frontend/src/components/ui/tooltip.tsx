import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

type TriggerProps = {
  onMouseEnter?: React.MouseEventHandler;
  onMouseLeave?: React.MouseEventHandler;
  onFocus?: React.FocusEventHandler;
  onBlur?: React.FocusEventHandler;
  'aria-describedby'?: string;
};

const GAP = 6;
const MARGIN = 8;

/**
 * A hover/focus tooltip, hand-rolled like dialog.tsx so there is no new
 * dependency. It renders into document.body with fixed positioning, so a
 * scrolling container (the week grid) never clips it. Escape or scrolling
 * hides it.
 *
 * `onlyWhenTruncated` shows it only if the trigger's text is cut off — for
 * names clamped to a few lines, where a tooltip on a short name is noise.
 */
export function Tooltip({
  content,
  children,
  className,
  onlyWhenTruncated = false,
}: {
  content: React.ReactNode;
  children: React.ReactElement<TriggerProps>;
  className?: string;
  onlyWhenTruncated?: boolean;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const show = (el: Element) => {
    if (onlyWhenTruncated && el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return;
    setAnchor(el.getBoundingClientRect());
  };
  const hide = useCallback(() => {
    setAnchor(null);
    setPosition(null);
  }, []);

  // Below the trigger, flipped above when there is no room, kept on screen.
  useLayoutEffect(() => {
    if (!anchor || !panel.current) return;
    const { width, height } = panel.current.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const top = below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, anchor.top - GAP - height) : below;
    const left = Math.min(Math.max(MARGIN, anchor.left), Math.max(MARGIN, window.innerWidth - width - MARGIN));
    setPosition({ top, left });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [anchor, hide]);

  const { props } = children;
  const trigger = cloneElement(children, {
    onMouseEnter: (event: React.MouseEvent) => {
      props.onMouseEnter?.(event);
      show(event.currentTarget);
    },
    onMouseLeave: (event: React.MouseEvent) => {
      props.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event: React.FocusEvent) => {
      props.onFocus?.(event);
      show(event.currentTarget);
    },
    onBlur: (event: React.FocusEvent) => {
      props.onBlur?.(event);
      hide();
    },
    'aria-describedby': anchor ? cn(props['aria-describedby'], id) : props['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {anchor
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="tooltip"
              style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
              className={cn(
                'pointer-events-none fixed z-50 max-w-xs rounded-lg border border-ink-200 bg-white p-3 text-left text-xs text-ink-800 shadow-lg',
                className,
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
