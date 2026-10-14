/**
 * Braun anti-slop ESLint plugin.
 * Bans emoji unicode, large border-radius utilities, and drop shadows in TSX.
 */

const BANNED_ROUNDED =
  /\brounded-(?:md|lg|xl|2xl|3xl|full)\b/;
const BANNED_SHADOW =
  /\bshadow(?:-sm|-md|-lg|-xl|-2xl)?\b/;
// Common emoji / pictograph ranges
const EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;

/** @type {import('eslint').Rule.RuleModule} */
const noSlopUi = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow AI-slop UI patterns (emoji, rounded>2px, shadows) in TSX',
    },
    schema: [],
    messages: {
      emoji: 'Braun UI forbids emoji characters in TSX. Use numbered labels or SVG icons.',
      rounded:
        'Braun UI forbids {{value}}. Use sharp corners (rounded-none / 0–2px) or led/led-sq.',
      shadow:
        'Braun UI forbids {{value}}. Use 1px solid border-grid hairlines instead of shadows.',
    },
  },
  create(context) {
    function checkLiteral(node, value) {
      if (typeof value !== 'string') return;

      if (EMOJI_RE.test(value)) {
        context.report({ node, messageId: 'emoji' });
      }

      const roundedMatch = value.match(BANNED_ROUNDED);
      if (roundedMatch) {
        context.report({
          node,
          messageId: 'rounded',
          data: { value: roundedMatch[0] },
        });
      }

      // Allow explicit shadow-none
      const shadowMatch = value.match(BANNED_SHADOW);
      if (shadowMatch && shadowMatch[0] !== 'shadow-none') {
        context.report({
          node,
          messageId: 'shadow',
          data: { value: shadowMatch[0] },
        });
      }
    }

    return {
      Literal(node) {
        checkLiteral(node, node.value);
      },
      TemplateElement(node) {
        checkLiteral(node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        if (typeof node.value === 'string' && EMOJI_RE.test(node.value)) {
          context.report({ node, messageId: 'emoji' });
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'no-slop-ui': noSlopUi,
  },
};
