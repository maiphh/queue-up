import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BE_VE_LAYERS, BE_VE_POSES, BeVe, Confetti, beVeMarkup, mascotPop, prefersReducedMotion } from '../src';

describe('Bé Vé', () => {
  it.each(BE_VE_POSES)('%s exposes every animation layer id', (pose) => {
    const { container } = render(<BeVe pose={pose} />);
    for (const id of BE_VE_LAYERS) {
      expect(container.querySelector(`#${id}`), `${pose} #${id}`).not.toBeNull();
    }
    expect(container.querySelector('svg')?.getAttribute('data-pose')).toBe(pose);
  });

  it('ships the 7 source SVGs with the same layer ids', () => {
    for (const pose of BE_VE_POSES) {
      const src = readFileSync(resolve(__dirname, `../assets/mascot/be-ve-${pose}.svg`), 'utf8');
      for (const id of BE_VE_LAYERS) expect(src).toContain(`id="${id}"`);
    }
  });

  it('prints and escapes the ticket number', () => {
    expect(beVeMarkup('idle', { num: 'A·014' })).toContain('>A·014<');
    expect(beVeMarkup('idle', { num: '<x>' })).toContain('&lt;x&gt;');
  });

  it('two mascots on a page get distinct mask ids', () => {
    const { container } = render(<><BeVe pose="idle" /><BeVe pose="idle" /></>);
    const masks = [...container.querySelectorAll('mask')].map((m) => m.id);
    expect(new Set(masks).size).toBe(2);
  });
});

describe('reduced motion', () => {
  afterEach(() => vi.unstubAllGlobals());
  const mm = (matches: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') && matches, media: q, addEventListener() {}, removeEventListener() {} }));

  it('detects the media query', () => {
    mm(true);
    expect(prefersReducedMotion()).toBe(true);
    mm(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('presets crossfade instead of moving', () => {
    const el = document.createElement('div');
    const animate = vi.fn(() => ({}) as Animation);
    (el as unknown as { animate: typeof animate }).animate = animate;
    mascotPop(el, true);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 180 }));
    animate.mockClear();
    mascotPop(el, false);
    expect(JSON.stringify(animate.mock.calls[0])).toContain('scale(0)');
  });

  it('confetti renders nothing under reduced motion', () => {
    mm(true);
    const { queryByTestId } = render(<Confetti />);
    expect(queryByTestId('confetti')).toBeNull();
  });

  it('confetti spawns 40 pieces otherwise', () => {
    mm(false);
    const { getByTestId } = render(<Confetti />);
    expect(getByTestId('confetti').children).toHaveLength(40);
  });
});
