// Scalpel Tailwind preset. Plugin authors using Tailwind extend their own
// tailwind.config.js with this preset to get utility classes like `bg-bg`,
// `text-accent`, `border-border` mapped to Scalpel's CSS variables. Combined
// with tokens.css imported in dev, plugin components render identically to
// how they look inside Scalpel.
//
// Usage in plugin author's tailwind.config.js:
//   const scalpelPreset = require('@scalpelpoe/plugin-sdk/tailwind-preset.cjs')
//   module.exports = {
//     presets: [scalpelPreset],
//     content: ['./src/**/*.{ts,tsx}'],
//   }
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          solid: 'var(--bg-solid)',
          'solid-translucent': 'var(--bg-solid-translucent)',
          card: 'var(--bg-card)',
          'card-translucent': 'var(--bg-card-translucent)',
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
        poe: ['var(--font-poe)'],
      },
    },
  },
}
