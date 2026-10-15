/**
 * Bé Vé — TS port of round3/src/mascot.py (same geometry, same layer ids):
 * #hat #body #face #eyes #mouth #arm-l #arm-r #legs #num #fx
 */
import { colors } from './tokens';

export type BeVePose = 'idle' | 'excited' | 'celebrate' | 'late' | 'sleep' | 'offline' | 'thanks';
export const BE_VE_POSES: readonly BeVePose[] = ['idle', 'excited', 'celebrate', 'late', 'sleep', 'offline', 'thanks'];
export const BE_VE_LAYERS = ['hat', 'body', 'face', 'eyes', 'mouth', 'arm-l', 'arm-r', 'legs', 'num', 'fx'] as const;

const { navy: NAVY, yellow: YEL, gold: GOLD, green: GREEN, beige: BEIGE } = colors;
const S = 5;
type Pt = readonly [number, number];
const L: Pt = [98, 146];
const R: Pt = [142, 146];
const both = (f: (x: number, y: number) => string) => f(...L) + f(...R);

function eyes(t: string): string {
  switch (t) {
    case 'open': return both((x, y) => `<ellipse cx="${x}" cy="${y}" rx="7.5" ry="10" fill="${NAVY}"/><circle cx="${x + 2.5}" cy="${y - 3.5}" r="2.6" fill="#fff"/>`);
    case 'big': return both((x, y) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="12.5" fill="${NAVY}"/><circle cx="${x + 3}" cy="${y - 4}" r="3.6" fill="#fff"/><circle cx="${x - 3}" cy="${y + 4}" r="1.6" fill="#fff"/>`);
    case 'happy': return both((x, y) => `<path d="M${x - 9} ${y + 3} Q${x} ${y - 9} ${x + 9} ${y + 3}" fill="none" stroke="${NAVY}" stroke-width="5" stroke-linecap="round"/>`);
    case 'closed': return both((x, y) => `<path d="M${x - 9} ${y} Q${x} ${y + 8} ${x + 9} ${y}" fill="none" stroke="${NAVY}" stroke-width="4.5" stroke-linecap="round"/>`);
    case 'worried': return both((x, y) => `<ellipse cx="${x}" cy="${y + 1}" rx="7" ry="9" fill="${NAVY}"/><circle cx="${x + 2}" cy="${y - 2}" r="2.4" fill="#fff"/>`);
    case 'sad': return both((x, y) => `<ellipse cx="${x}" cy="${y + 2}" rx="6.5" ry="8" fill="${NAVY}"/><circle cx="${x + 2}" cy="${y - 1}" r="2.2" fill="#fff"/>`);
    default: return '';
  }
}

function brows(t: string): string {
  if (t === 'worried') return `<path d="M88 128 L104 133 M152 128 L136 133" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/>`;
  if (t === 'up') return `<path d="M89 126 Q98 120 107 125 M133 125 Q142 120 151 126" fill="none" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/>`;
  if (t === 'sad') return `<path d="M89 133 L105 128 M151 133 L135 128" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/>`;
  return '';
}

function mouth(t: string): string {
  switch (t) {
    case 'smile': return `<path d="M110 167 Q120 177 130 167" fill="none" stroke="${NAVY}" stroke-width="4.5" stroke-linecap="round"/>`;
    case 'open': return `<path d="M107 164 Q120 166 133 164 Q131 184 120 184 Q109 184 107 164 Z" fill="${NAVY}"/><path d="M112 177 Q120 172 128 177 Q125 183 120 183 Q115 183 112 177Z" fill="#FF7A7A"/>`;
    case 'grin': return `<path d="M102 162 Q120 165 138 162 Q136 188 120 188 Q104 188 102 162 Z" fill="${NAVY}"/><path d="M109 179 Q120 172 131 179 Q127 187 120 187 Q113 187 109 179Z" fill="#FF7A7A"/>`;
    case 'o': return `<ellipse cx="120" cy="172" rx="6" ry="7.5" fill="${NAVY}"/>`;
    case 'sad': return `<path d="M110 175 Q120 166 130 175" fill="none" stroke="${NAVY}" stroke-width="4.5" stroke-linecap="round"/>`;
    case 'wobble': return `<path d="M108 173 Q112 168 116 173 Q120 178 124 173 Q128 168 132 173" fill="none" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/>`;
    case 'sleep': return `<ellipse cx="120" cy="173" rx="4.5" ry="3.5" fill="${NAVY}"/>`;
    default: return '';
  }
}

type Arms = readonly [Pt, Pt, Pt, Pt, Pt, Pt];
const ARMS: Record<string, Arms> = {
  down: [[52, 170], [36, 196], [30, 206], [188, 170], [204, 196], [210, 206]],
  up: [[52, 166], [30, 140], [28, 108], [188, 166], [210, 140], [212, 108]],
  wave: [[52, 170], [36, 196], [30, 206], [188, 166], [216, 146], [220, 104]],
  pump: [[52, 170], [30, 170], [36, 140], [188, 170], [210, 170], [204, 140]],
  together: [[52, 172], [70, 206], [110, 200], [188, 172], [170, 206], [130, 200]],
  sleep: [[52, 176], [46, 204], [60, 214], [188, 176], [194, 204], [180, 214]],
  shrug: [[52, 170], [28, 176], [22, 156], [188, 170], [212, 176], [218, 156]],
};

function arm(side: 'l' | 'r', a: Arms): string {
  const [s, c, h] = side === 'l' ? [a[0], a[1], a[2]] : [a[3], a[4], a[5]];
  const d = `M${s[0]} ${s[1]} Q${c[0]} ${c[1]} ${h[0]} ${h[1]}`;
  return `<g id="arm-${side}" data-layer="arm-${side}"><path d="${d}" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/><circle cx="${h[0]}" cy="${h[1]}" r="9" fill="${YEL}" stroke="${NAVY}" stroke-width="4"/></g>`;
}

function fx(name: string): string {
  const g = (inner: string, attrs = '') => `<g id="fx" data-layer="fx" style="transform-box:fill-box;transform-origin:50% 50%"><g${attrs}>${inner}</g></g>`;
  switch (name) {
    case 'zzz': return g(`<text x="176" y="78" font-size="22">z</text><text x="194" y="58" font-size="28">z</text><text x="214" y="34" font-size="34">Z</text>`, ` font-family="Lexend" font-weight="800" fill="${NAVY}"`);
    case 'confetti': {
      const cs: [number, number, string, number][] = [[30, 60, GREEN, 20], [60, 30, '#FF7A7A', -30], [190, 36, GREEN, 45], [214, 74, NAVY, 10], [22, 110, GOLD, 60], [206, 120, '#FF7A7A', -15], [96, 14, NAVY, 30], [150, 18, GOLD, -40]];
      return g(cs.map(([x, y, c, r]) => `<rect x="${x}" y="${y}" width="12" height="7" rx="2" fill="${c}" transform="rotate(${r} ${x + 6} ${y + 3})"/>`).join('') + `<circle cx="44" cy="84" r="4" fill="${GREEN}"/><circle cx="200" cy="96" r="4" fill="${GOLD}"/><circle cx="120" cy="6" r="4" fill="#FF7A7A"/>`);
    }
    case 'sparkle': {
      const st = (x: number, y: number, r: number, c: string) => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;
      return g(st(30, 90, 13, GREEN) + st(212, 82, 16, GOLD) + st(200, 132, 8, GREEN));
    }
    case 'sweat': return g(`<path d="M176 112 Q184 126 176 132 Q168 126 176 112Z" fill="#8FD3F4" stroke="${NAVY}" stroke-width="3"/><path d="M226 92 l10 -6 M228 108 l12 0 M224 76 l8 -10" stroke="${NAVY}" stroke-width="3.5" stroke-linecap="round"/>`);
    case 'wifi': return g(`<circle cx="24" cy="24" r="24" fill="#fff" stroke="${NAVY}" stroke-width="4"/><path d="M10 22 Q24 10 38 22 M15 28 Q24 20 33 28" fill="none" stroke="${NAVY}" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="34" r="3" fill="${NAVY}"/><path d="M12 12 L36 38" stroke="#E5484D" stroke-width="4" stroke-linecap="round"/>`, ' transform="translate(178 22)"');
    case 'heart': {
      const h = 'M120 22 C110 6 86 14 92 34 C96 46 120 58 120 58 C120 58 144 46 148 34 C154 14 130 6 120 22Z';
      return g(`<path d="${h}" fill="#FF7A7A" stroke="${NAVY}" stroke-width="4" transform="translate(118 8) scale(.5)"/><path d="${h}" fill="#FF7A7A" stroke="${NAVY}" stroke-width="5" transform="translate(-14 40) scale(.34)"/>`);
    }
    case 'dots': return g(`<rect x="166" y="30" width="62" height="38" rx="19" fill="#fff" stroke="${NAVY}" stroke-width="4"/><circle cx="183" cy="49" r="4.5" fill="${NAVY}"/><circle cx="197" cy="49" r="4.5" fill="${NAVY}"/><circle cx="211" cy="49" r="4.5" fill="${NAVY}"/>`);
    default: return g('');
  }
}

type PoseDef = { eyes: string; mouth: string; brows: string; arms: string; fx: string; tilt: number; squish?: number; label: string };
export const POSES: Record<BeVePose, PoseDef> = {
  idle: { eyes: 'open', mouth: 'smile', brows: '', arms: 'down', fx: 'dots', tilt: 0, label: 'Đang chờ' },
  excited: { eyes: 'big', mouth: 'open', brows: 'up', arms: 'pump', fx: 'sparkle', tilt: -4, label: 'Sắp đến lượt' },
  celebrate: { eyes: 'happy', mouth: 'grin', brows: '', arms: 'up', fx: 'confetti', tilt: -10, label: 'Đến lượt bạn!' },
  late: { eyes: 'worried', mouth: 'o', brows: 'worried', arms: 'wave', fx: 'sweat', tilt: 6, label: 'Bạn ơi, đã gọi rồi!' },
  sleep: { eyes: 'closed', mouth: 'sleep', brows: '', arms: 'sleep', fx: 'zzz', tilt: 14, squish: 0.94, label: 'Tạm dừng' },
  offline: { eyes: 'sad', mouth: 'wobble', brows: 'sad', arms: 'shrug', fx: 'wifi', tilt: 0, label: 'Mất kết nối' },
  thanks: { eyes: 'happy', mouth: 'smile', brows: '', arms: 'together', fx: 'heart', tilt: -6, label: 'Cảm ơn bạn!' },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Inner markup of the 240×260 Bé Vé SVG (no outer <svg>). */
export function beVeMarkup(pose: BeVePose, opts: { num?: string; uid?: string } = {}): string {
  const p = POSES[pose];
  const uid = (opts.uid ?? pose).replace(/[^a-zA-Z0-9_-]/g, '');
  const num = esc(opts.num ?? 'A·012');
  const sq = p.squish ?? 1;
  const hatY = pose === 'sleep' ? 6 : 0;
  const ribs = [64, 92, 120, 148, 176].map((x) => `<path d="M120 26 L${x} ${+(108 - Math.abs(120 - x) * 0.06).toFixed(2)}" stroke="#C4B07A" stroke-width="2.4"/>`).join('');
  const hat = `<g id="hat" data-layer="hat" style="transform-box:fill-box;transform-origin:50% 100%"><g transform="rotate(${p.tilt} 120 104) translate(0 ${hatY})"><path d="M120 22 L208 102 Q120 124 32 102 Z" fill="${BEIGE}" stroke="${NAVY}" stroke-width="${S}" stroke-linejoin="round"/>${ribs}<path d="M40 104 Q120 124 200 104" fill="none" stroke="${GREEN}" stroke-width="7" stroke-linecap="round"/><circle cx="120" cy="22" r="5" fill="${GREEN}" stroke="${NAVY}" stroke-width="3"/></g></g>`;
  const body = `<defs><mask id="m-${uid}"><rect x="0" y="0" width="240" height="260" fill="#fff"/><circle cx="50" cy="196" r="12" fill="#000"/><circle cx="190" cy="196" r="12" fill="#000"/></mask><clipPath id="c-${uid}"><rect x="50" y="98" width="140" height="132" rx="30"/></clipPath></defs>`
    + `<g id="body" data-layer="body" mask="url(#m-${uid})"><rect x="50" y="98" width="140" height="132" rx="30" fill="${YEL}"/><rect x="50" y="196" width="140" height="40" fill="${GOLD}" clip-path="url(#c-${uid})"/><rect x="50" y="98" width="140" height="132" rx="30" fill="none" stroke="${NAVY}" stroke-width="${S}"/><path d="M50 184 A12 12 0 0 1 50 208 M190 184 A12 12 0 0 0 190 208" fill="none" stroke="${NAVY}" stroke-width="${S}"/></g>`
    + `<path d="M66 196 L174 196" stroke="${NAVY}" stroke-width="3" stroke-dasharray="6 6"/>`
    + `<text id="num" data-layer="num" x="120" y="220" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="17" fill="${NAVY}">${num}</text>`;
  const face = `<g id="face" data-layer="face"><ellipse cx="80" cy="164" rx="9" ry="6" fill="#FF9E9E" opacity=".75"/><ellipse cx="160" cy="164" rx="9" ry="6" fill="#FF9E9E" opacity=".75"/><g id="eyes" data-layer="eyes">${eyes(p.eyes)}</g>${brows(p.brows)}<g id="mouth" data-layer="mouth">${mouth(p.mouth)}</g></g>`;
  const legs = `<g id="legs" data-layer="legs"><rect x="90" y="222" width="18" height="24" rx="8" fill="${NAVY}"/><rect x="132" y="222" width="18" height="24" rx="8" fill="${NAVY}"/><ellipse cx="97" cy="246" rx="14" ry="6" fill="${NAVY}"/><ellipse cx="143" cy="246" rx="14" ry="6" fill="${NAVY}"/></g>`;
  const a = ARMS[p.arms]!;
  const front = ['together', 'pump', 'sleep'].includes(p.arms);
  const arms = arm('l', a) + arm('r', a);
  const shadow = '<ellipse cx="120" cy="252" rx="62" ry="7" fill="#000" opacity=".08"/>';
  return `${shadow}<g id="be-ve" data-layer="be-ve" transform="translate(0 ${+(260 * (1 - sq)).toFixed(2)}) scale(1 ${sq})">${legs}${front ? '' : arms}${body}${face}${front ? arms : ''}${hat}</g>${fx(p.fx)}`;
}
