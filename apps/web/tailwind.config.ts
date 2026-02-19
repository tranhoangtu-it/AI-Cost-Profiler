import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a0f',
          surface: '#111118',
          elevated: '#1a1a24',
          muted: '#23232f',
        },
        text: {
          primary: '#e8e8ed',
          secondary: '#9494a8',
          muted: '#5c5c72',
        },
        cost: {
          low: '#34d399',
          medium: '#fbbf24',
          high: '#f87171',
          critical: '#ef4444',
        },
        accent: {
          primary: '#818cf8',
          secondary: '#38bdf8',
        },
        border: {
          default: '#1e1e2e',
          focus: '#818cf8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'monospace'],
        sans: ['Inter', 'SF Pro', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
