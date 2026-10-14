import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type LedIndicatorState = 'active' | 'warning' | 'idle';

export type LedIndicatorProps = HTMLAttributes<HTMLSpanElement> & {
  state: LedIndicatorState;
};

const STATE_CLASS: Record<LedIndicatorState, string> = {
  active: 'bg-signal-green',
  warning: 'bg-signal-amber',
  idle: 'bg-grid',
};

const STATE_LABEL: Record<LedIndicatorState, string> = {
  active: 'active',
  warning: 'warning',
  idle: 'idle',
};

/** Crisp 6px hardware LED (circle exception to zero-radius rule). */
export function LedIndicator({
  state,
  className,
  ...props
}: LedIndicatorProps) {
  return (
    <span
      role="status"
      data-braun="led"
      data-state={state}
      aria-label={STATE_LABEL[state]}
      className={cn(
        'inline-block h-[6px] w-[6px] shrink-0 rounded-led',
        STATE_CLASS[state],
        className,
      )}
      {...props}
    />
  );
}
