import type { CSSProperties } from 'react'
import { getCurrencyIconMap } from './currency-icons'
import { usePoeVersion } from './poe-version-context'
import { useCurrencyLabelsAsText } from './currency-labels-context'
import { getCurrencyShortLabel } from './currency-short-labels'

interface CurrencyIconProps {
  /** Trade-API currency key, e.g. "chaos", "divine", "exa". */
  name: string
  /** Tailwind classes. Passed through to the rendered <img> or <span>.
   *  In text mode the span inherits the surrounding font size and adds
   *  `font-semibold uppercase` so the label fills the same cap-height as
   *  neighboring numeric values (lowercase x-height letters would otherwise
   *  sit visually low in a flex `items-center` chip). Size classes (w-*, h-*)
   *  are effectively no-ops on an inline span but still safe to pass. */
  className?: string
  /** Inline style, passed to both the <img> and the text-mode <span>. Useful
   *  when callers need exact pixel sizing (e.g. CurrencyChip's iconSize). */
  style?: CSSProperties
  /** Alt text for the <img> in icon mode. Defaults to the curated short label
   *  (e.g. "chaos", "div", "ex") so screen readers announce the currency. */
  alt?: string
}

/** Renders a currency icon, or its curated short text label when the
 *  "show currency names" setting is on. Replaces the inline
 *  `<img src={iconUrl} alt="" className="..." />` pattern used previously at
 *  every currency display site. */
export function CurrencyIcon({ name, className, style, alt }: CurrencyIconProps): JSX.Element {
  const textMode = useCurrencyLabelsAsText()
  const version = usePoeVersion()
  const shortLabel = getCurrencyShortLabel(name)

  if (textMode) {
    // `top: -0.075em` nudges the label up so its visual center matches the
    // surrounding digits. Even uppercased, letter cap-height sits slightly
    // below digit-height in most sans-serif fonts (lining figures), which
    // reads as "low" in a flex items-center chip. Em-based so it scales with
    // whatever text-[Xpx] the call site uses.
    return (
      <span
        className={`font-semibold uppercase ${className ?? ''}`}
        style={{ ...style, position: 'relative', top: '-0.075em' }}
      >
        {shortLabel}
      </span>
    )
  }

  const iconUrl = getCurrencyIconMap(version)[name]
  if (!iconUrl) {
    // Defensive fallback: caller passed a currency that's not in the icon map
    // for this PoE version. Render a small dim label rather than a broken
    // image - matches the pre-refactor BulkListings/TradeListings treatment
    // for unknown trade-API keys (intentionally unobtrusive).
    return <span className={`text-[10px] text-text-dim ${className ?? ''}`}>{shortLabel}</span>
  }
  return <img src={iconUrl} alt={alt ?? shortLabel} className={className} style={style} />
}
