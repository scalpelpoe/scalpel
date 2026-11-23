/** Inline-style twin of the postcss font-scale rewrite (postcss.config.js): inline
 *  styles never pass through PostCSS, so px font sizes set from JS go through here
 *  to follow the accessibility fontScale setting. */
export function scaledPx(px: number): string {
  return `calc(${px}px * var(--font-scale, 1))`
}
