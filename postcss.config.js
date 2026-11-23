// Accessibility font scale: every absolute font-size / line-height (px or rem) in the
// renderer's CSS - Tailwind's text-[11px] / text-xs / leading-* utilities and
// styles.css alike - is multiplied by --font-scale, which apply-theme.ts sets on :root
// from the fontScale setting. Relative units (em, %, unitless line-height) already
// follow the scaled parent, so they are left alone.
const ABSOLUTE = /^(-?\d*\.?\d+)(px|rem)$/
const fontScale = () => ({
  postcssPlugin: 'scalpel-font-scale',
  Declaration: {
    'font-size': scaleDecl,
    'line-height': scaleDecl,
  },
})
fontScale.postcss = true

function scaleDecl(decl) {
  const m = ABSOLUTE.exec(decl.value.trim())
  if (!m) return
  decl.value = `calc(${m[1]}${m[2]} * var(--font-scale, 1))`
}

module.exports = {
  plugins: [require('tailwindcss'), require('autoprefixer'), fontScale],
}
