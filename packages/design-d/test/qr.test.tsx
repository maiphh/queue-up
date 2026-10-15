import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrCode, qrMatrix } from '../src';

describe('QrCode', () => {
  it('encodes a real QR matrix with finder patterns', () => {
    const m = qrMatrix('https://zalo.me/s/123/?branch=qr-pho-nguyen-hue');
    expect(m.length).toBeGreaterThanOrEqual(21);
    // top-left finder: 7 dark modules across row 0
    expect(m[0]!.slice(0, 7).every(Boolean)).toBe(true);
    expect(m[1]![1]).toBe(false);
  });
  it('renders an svg labelled with the url', () => {
    const { container } = render(<QrCode value="abc" size={120} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-qr-url')).toBe('abc');
    expect(svg.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(50);
  });
});
