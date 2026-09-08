import { Link, type LinkProps } from 'react-router-dom';
import type { VariantProps } from 'class-variance-authority';

import { buttonVariants } from './button';
import { cn } from '@/lib/utils';

/**
 * A router link styled as a button.
 *
 * Kept separate from Button rather than adding an `asChild` prop: navigation
 * is an anchor, and rendering it as one keeps middle-click, open-in-new-tab
 * and the correct screen-reader role working.
 */
export function LinkButton({
  className,
  variant,
  size,
  ...props
}: LinkProps & VariantProps<typeof buttonVariants>) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
