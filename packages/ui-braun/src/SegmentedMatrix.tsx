import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { cn } from './cn';

export const SEGMENTED_MATRIX_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type SegmentedMatrixValue = (typeof SEGMENTED_MATRIX_OPTIONS)[number];

export type SegmentedMatrixProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> & {
  value?: SegmentedMatrixValue;
  defaultValue?: SegmentedMatrixValue;
  onChange?: (value: SegmentedMatrixValue) => void;
  disabled?: boolean;
};

function optionLabel(n: SegmentedMatrixValue): string {
  return n === 8 ? '8+' : String(n);
}

/** Horizontal 1–8+ numeric selector with collapsed hairline borders. */
export function SegmentedMatrix({
  value: valueProp,
  defaultValue = 2,
  onChange,
  disabled = false,
  className,
  ...props
}: SegmentedMatrixProps) {
  const [uncontrolled, setUncontrolled] =
    useState<SegmentedMatrixValue>(defaultValue);
  const value = valueProp ?? uncontrolled;

  function select(next: SegmentedMatrixValue) {
    if (disabled) return;
    if (valueProp === undefined) setUncontrolled(next);
    onChange?.(next);
  }

  return (
    <div
      role="radiogroup"
      data-braun="segmented-matrix"
      aria-disabled={disabled || undefined}
      className={cn('inline-flex items-stretch', className)}
      {...props}
    >
      {SEGMENTED_MATRIX_OPTIONS.map((n, index) => {
        const selected = n === value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-selected={selected || undefined}
            onClick={() => select(n)}
            className={cn(
              'min-h-[48px] min-w-[44px] px-3',
              'border border-grid bg-panel',
              'font-mono text-sm tabular text-carbon',
              'rounded-none',
              'disabled:pointer-events-none disabled:opacity-40',
              index > 0 && '-ml-[1px]',
              selected &&
                'relative z-[1] border-carbon bg-ink text-panel',
            )}
          >
            {optionLabel(n)}
          </button>
        );
      })}
    </div>
  );
}
