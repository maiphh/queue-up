import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export type QrCodeProps = {
  /** Text/URL to encode. */
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
  className?: string;
  label?: string;
};

/** Build the module matrix for `value` (error correction M, auto version). */
export function qrMatrix(value: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(value);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => q.isDark(y, x)));
}

/** Real, scannable QR as inline SVG (1-module quiet zone). */
export function QrCode({ value, size = 200, fg = '#080707', bg = '#ffffff', className, label }: QrCodeProps) {
  const { n, d } = useMemo(() => {
    const m = qrMatrix(value);
    const parts: string[] = [];
    m.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) parts.push(`M${x + 1} ${y + 1}h1v1h-1z`);
      }),
    );
    return { n: m.length + 2, d: parts.join('') };
  }, [value]);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label ?? `QR ${value}`}
      data-qr-url={value}
    >
      <rect width={n} height={n} fill={bg} />
      <path d={d} fill={fg} />
    </svg>
  );
}
