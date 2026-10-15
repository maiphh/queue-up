import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './motion';
import { colors, dur } from './tokens';

const PALETTE = [colors.yellow, colors.gold, colors.navy, colors.cream, '#FF7A7A', colors.mint];

/** 40-piece confetti burst, 1.6s, once. Renders nothing under reduced motion. */
export function Confetti({ count = 40, seed = 1 }: { count?: number; seed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root || reduced) return;
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pieces: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'd-confetti-piece';
      p.style.left = `${10 + rnd() * 80}%`;
      p.style.background = PALETTE[i % PALETTE.length]!;
      root.appendChild(p);
      pieces.push(p);
      if (typeof p.animate === 'function') {
        const dx = (rnd() - 0.5) * 240;
        const rot = (rnd() - 0.5) * 900;
        p.animate(
          [
            { transform: 'translate(0,-20px) rotate(0)', opacity: 1 },
            { transform: `translate(${dx}px, 110vh) rotate(${rot}deg)`, opacity: 0.9 },
          ],
          { duration: dur.celebrate, delay: rnd() * 250, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' },
        );
      }
    }
    return () => pieces.forEach((p) => p.remove());
  }, [count, seed, reduced]);

  if (reduced) return null;
  return <div ref={ref} className="d-confetti" data-testid="confetti" aria-hidden />;
}
