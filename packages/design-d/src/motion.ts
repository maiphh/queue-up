/**
 * WAAPI motion presets from the round-3 storyboard.
 * Every preset honours prefers-reduced-motion: crossfade 150–200ms only,
 * no confetti, static mascot. Only transform + opacity are animated.
 */
import { dur, ease, haptics } from './tokens';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

type Target = Element | null | undefined;
type Frames = Keyframe[];

function run(el: Target, frames: Frames, opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, { fill: 'both', ...opts });
}

/** Crossfade used for every preset under reduced motion. */
function fade(el: Target): Animation | null {
  return run(el, [{ opacity: 0 }, { opacity: 1 }], { duration: dur.reduced, easing: 'linear' });
}

function preset(fullMotion: (el: Element) => Animation | null) {
  return (el: Target, reduced = prefersReducedMotion()): Animation | null => {
    if (!el) return null;
    return reduced ? fade(el) : fullMotion(el);
  };
}

const layer = (root: Element, id: string) => root.querySelector(`[data-layer="${id}"]`);

/** 1 · "Lấy số" press: scale .96, 150ms. */
export const tapPress = preset((el) =>
  run(el, [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: dur.tap, easing: ease.inOut, fill: 'none' }));

/** 1 · Ticket slides up: 600ms easeOutBack(1.4). */
export const ticketIssue = preset((el) =>
  run(el, [{ transform: 'translateY(80%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: dur.enter, easing: ease.outBack }));

/** 1 · Bé Vé pops in: scale 0→1 400ms with squash .9/1.08. */
export const mascotPop = preset((el) =>
  run(el, [
    { transform: 'scale(0)' },
    { transform: 'scale(1.08, .9)', offset: 0.6 },
    { transform: 'scale(.96, 1.04)', offset: 0.8 },
    { transform: 'scale(1)' },
  ], { duration: dur.enterShort, easing: ease.outBack }));

/** 2 · Number rolls (old out up, new in from below): 300ms easeInOutCubic. */
export const numberRoll = preset((el) =>
  run(el, [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: dur.base, easing: ease.inOut }));

/** 2 · Progress bar fill: 600ms. Pass the target scaleX (0..1). */
export function progressTo(el: Target, from: number, to: number, reduced = prefersReducedMotion()): Animation | null {
  return run(el, [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], {
    duration: reduced ? dur.reduced : dur.enter,
    easing: reduced ? 'linear' : ease.inOut,
  });
}

/** 3 · Notice/banner slides down: 400ms easeOutQuint, then spring wobble ±3° ×2 (600ms). */
export const bannerIn = preset((el) => {
  const a = run(el, [{ transform: 'translateY(-120%)' }, { transform: 'translateY(0)' }], { duration: dur.enterShort, easing: ease.outQuint });
  run(el, [
    { transform: 'rotate(0)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-3deg)' },
    { transform: 'rotate(3deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' },
  ], { duration: dur.enter, delay: dur.enterShort, easing: ease.inOut, composite: 'add', fill: 'none' });
  return a;
});

/** 3 · Bé Vé hops twice (whole body) + hat wobble. */
export const mascotHop = preset((el) => {
  const hat = layer(el, 'hat');
  if (hat) run(hat, [{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], { duration: dur.enter, iterations: 2, fill: 'none' });
  return run(el, [
    { transform: 'translateY(0)' }, { transform: 'translateY(-18%)', offset: 0.3 }, { transform: 'translateY(0)', offset: 0.5 },
    { transform: 'translateY(-12%)', offset: 0.75 }, { transform: 'translateY(0)' },
  ], { duration: dur.enter, easing: ease.outQuint, fill: 'none' });
});

/** 4 · Green floods from the centre: 450ms easeInOutCubic (scale of a circle). */
export const greenReveal = preset((el) =>
  run(el, [{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, easing: ease.inOut }));

/** 4 · Number pop .6 → 1.08 → 1. */
export const numberPop = preset((el) =>
  run(el, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: dur.enterShort, easing: ease.outBack }));

/** 4 · Bé Vé celebrates: arms wave + body bounce for 1.6s (one run, no loop). */
export const mascotCelebrate = preset((el) => {
  for (const [id, deg] of [['arm-l', -14], ['arm-r', 14]] as const) {
    const a = layer(el, id);
    if (a) run(a, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }, { transform: 'rotate(0)' }], { duration: 400, iterations: 4, fill: 'none' });
  }
  return run(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(-8%)' }, { transform: 'translateY(0)' }], { duration: 400, iterations: 4, easing: ease.inOut, fill: 'none' });
});

/** 5 · Staff "GỌI SỐ TIẾP" press: 100ms. */
export const callPress = preset((el) =>
  run(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(0)' }], { duration: 100, fill: 'none' }));

/** 5 · Serving number flips A·009 → A·010: 350ms. */
export const numberFlip = preset((el) =>
  run(el, [{ transform: 'perspective(400px) rotateX(90deg)', opacity: 0 }, { transform: 'perspective(400px) rotateX(0)', opacity: 1 }], { duration: 350, easing: ease.outQuint }));

/** 5 · Row collapse 250ms (opacity + scaleY). */
export const rowCollapse = preset((el) =>
  run(el, [{ opacity: 1, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(.2)' }], { duration: 250, easing: ease.inOut }));

/** Toast enter (staff): ≤ 400ms, once. */
export const toastIn = preset((el) =>
  run(el, [{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 300, easing: ease.outQuint }));

/** Haptics (Zalo WebView supports navigator.vibrate on Android; iOS ignores). Still fires under reduced motion. */
export function vibrate(kind: keyof typeof haptics): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([...haptics[kind]]);
  } catch {
    /* unsupported */
  }
}
