import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type TabularMetricSize = 'display' | 'lg' | 'md';

export type TabularMetricProps = HTMLAttributes<HTMLSpanElement> & {
  size?: TabularMetricSize;
  value: string;
};

const SIZE_CLASS: Record<TabularMetricSize, string> = {
  display: 'text-5xl leading-none tracking-tight',
  lg: 'text-2xl leading-tight tracking-tight',
  md: 'text-base leading-normal',
};

/** Strict tabular-nums monospace readout (ticket codes, timers, counts). */
export function TabularMetric({
  size = 'md',
  value,
  className,
  ...props
}: TabularMetricProps) {
  return (
    <span
      data-braun="tabular-metric"
      data-size={size}
      className={cn(
        'font-mono tabular text-carbon rounded-none',
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {value}
    </span>
  );
}
