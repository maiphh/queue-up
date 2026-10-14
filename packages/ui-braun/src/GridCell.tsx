import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type GridCellProps = HTMLAttributes<HTMLDivElement> & {
  /** Technical index header, e.g. `01 / PARTY SIZE`. */
  label: string;
  children?: ReactNode;
};

/** Hairline content cell with uppercase mono index header. */
export function GridCell({
  label,
  children,
  className,
  ...props
}: GridCellProps) {
  return (
    <div
      data-braun="grid-cell"
      className={cn(
        'border border-grid bg-panel rounded-none',
        className,
      )}
      {...props}
    >
      <div className="border-b border-grid px-3 py-1.5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-graphite tabular">
          {label}
        </p>
      </div>
      {children != null ? <div className="p-3">{children}</div> : null}
    </div>
  );
}
