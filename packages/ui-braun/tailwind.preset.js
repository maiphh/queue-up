/** @type {import('tailwindcss').Config} */
const braunPreset = {
  theme: {
    extend: {
      colors: {
        chassis: '#E6E5E0',
        panel: '#F4F3EF',
        ink: '#111111',
        grid: '#C8C6BE',
        carbon: '#111111',
        graphite: '#66645E',
        signal: {
          orange: '#FF4400',
          amber: '#D97706',
          green: '#15803D',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        sm: '0px',
        DEFAULT: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '0px',
        // Hardware LED indicators only (6px circle / 4px square)
        led: '50%',
        'led-sq': '4px',
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
        none: 'none',
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
    },
  },
  plugins: [
    function tabularNumsPlugin({ addUtilities }) {
      addUtilities({
        '.tabular': {
          fontVariantNumeric: 'tabular-nums',
        },
      });
    },
  ],
};

export default braunPreset;
