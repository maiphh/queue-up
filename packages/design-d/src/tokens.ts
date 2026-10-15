/** Style D "Tươi & Nổi" — Fresh Signal. Green = your turn. */
export const colors = {
  green: '#079975',
  mint: '#75AC98',
  yellow: '#F6EA39',
  gold: '#DFC139',
  navy: '#2E2B70',
  ink: '#080707',
  cream: '#FDFCF6',
  beige: '#E2D4A6',
} as const;

export const fonts = {
  display: "'Lexend', system-ui, sans-serif",
  body: "'Be Vietnam Pro', system-ui, sans-serif",
} as const;

/** Duration tokens (ms) from the storyboard. */
export const dur = {
  tap: 150,
  base: 300,
  enter: 600,
  enterShort: 400,
  celebrate: 1600,
  reduced: 180,
} as const;

export const ease = {
  outBack: 'cubic-bezier(.34,1.56,.64,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  outQuint: 'cubic-bezier(.22,1,.36,1)',
} as const;

/** navigator.vibrate patterns: take number / almost / your turn. */
export const haptics = {
  issued: [10],
  almost: [20, 40, 20],
  yourTurn: [30, 50, 30, 50, 60],
} as const;
