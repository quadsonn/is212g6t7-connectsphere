import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
  ),
  {
    variants: {
      variant: {
        primary:
          'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-700',
        secondary:
          'bg-white text-ink-800 ring-1 ring-inset ring-ink-300 hover:bg-ink-50',
        ghost: 'text-ink-700 hover:bg-ink-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
