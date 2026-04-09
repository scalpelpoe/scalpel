/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          solid: 'var(--bg-solid)',
          card: 'var(--bg-card)',
          hover: 'var(--bg-hover)',
        },
        border: 'var(--border)',
        accent: {
          DEFAULT: 'var(--accent)',
          dim: 'var(--accent-dim)',
        },
        match: {
          DEFAULT: 'var(--match)',
          dim: 'var(--match-dim)',
        },
        'secondary-match': {
          DEFAULT: 'var(--secondary-match)',
          dim: 'var(--secondary-match-dim)',
        },
        text: {
          DEFAULT: 'var(--text)',
          dim: 'var(--text-dim)',
        },
        danger: 'var(--danger)',
        hide: 'var(--hide-color)',
        show: 'var(--show-color)',
        minimal: 'var(--minimal-color)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      fontFamily: {
        mono: ['Consolas', 'Cascadia Code', 'monospace'],
        poe: ['"Fontin SmallCaps"', 'serif'],
      },
    },
  },
  plugins: [],
}
