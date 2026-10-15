import { forwardRef, useId, useMemo } from 'react';
import { beVeMarkup, POSES, type BeVePose } from './mascot';

export type BeVeProps = {
  pose: BeVePose;
  /** Width in px (height keeps the 240:260 ratio). */
  size?: number;
  /** Ticket number printed on the stub. */
  num?: string;
  className?: string;
  /** Decorative by default; pass a label to expose it. */
  label?: string;
};

/** Bé Vé mascot. Layers: #hat #body #face #eyes #mouth #arm-l #arm-r #legs #num #fx. */
export const BeVe = forwardRef<HTMLDivElement, BeVeProps>(function BeVe(
  { pose, size = 120, num, className, label },
  ref,
) {
  const uid = useId();
  const html = useMemo(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 260" width="${size}" height="${Math.round((size * 260) / 240)}" data-pose="${pose}" style="overflow:visible">${beVeMarkup(pose, { num, uid: `${pose}${uid}` })}</svg>`,
    [pose, size, num, uid],
  );
  return (
    <div
      ref={ref}
      className={['be-ve', className].filter(Boolean).join(' ')}
      data-pose={pose}
      data-testid={`be-ve-${pose}`}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      title={label ?? POSES[pose].label}
      style={{ width: size, display: 'inline-block', lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
