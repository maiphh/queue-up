import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type BraunChassisProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

/** Outer hardware casing: chassis surface + 1px grid frame. */
export function BraunChassis({
  children,
  className,
  ...props
}: BraunChassisProps) {
  return (
    <div
      data-braun="chassis"
      className={cn('bg-chassis border border-grid rounded-none', className)}
      {...props}
    >
      {children}
    </div>
  );
}
