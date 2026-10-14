import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type KeycapButtonVariant = 'primary' | 'secondary' | 'danger';

export type KeycapButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: KeycapButtonVariant;
  children?: ReactNode;
};

const VARIANT_CLASS: Record<KeycapButtonVariant, string> = {
  primary: 'bg-signal-orange text-panel border-carbon',
  secondary: 'bg-panel text-carbon border-grid border-b-carbon',
  danger: 'bg-ink text-panel border-carbon',
};

/** Tactile rectangular keycap with border-b-2 press state. */
export function KeycapButton({
  variant = 'primary',
  children,
  className,
  type = 'button',
  disabled,
  ...props
}: KeycapButtonProps) {
  return (
    <button
      type={type}
      data-braun="keycap"
      data-variant={variant}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        'min-h-[48px] px-4 py-2',
        'border border-b-2',
        'font-sans text-sm font-semibold uppercase tracking-wide',
        'rounded-none',
        'transition-none',
        'active:translate-y-[2px] active:border-b',
        'disabled:pointer-events-none disabled:opacity-40',
        'hover:brightness-110',
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
