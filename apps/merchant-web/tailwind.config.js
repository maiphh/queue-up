import braunPreset from '@luotdi/ui-braun/tailwind.preset';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  presets: [braunPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
