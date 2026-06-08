/** Curated short labels for currency trade-API keys, used by <CurrencyIcon>
 *  when the user enables the "show currency names" accessibility setting.
 *  Style: lowercase, no "Orb" suffix, trade-site shorthand where one exists
 *  (e.g. "ex" for Exalted Orb, "trans" for Transmutation).
 *
 *  KEEP IN SYNC with getCurrencyIconMap() in shared/currency-icons.ts.
 *  The unit test enforces that every key in the icon map has a label here, so
 *  adding a new currency without updating this map will fail CI. */
export const CURRENCY_SHORT_LABELS: Record<string, string> = {
  chaos: 'c',
  divine: 'div',
  exa: 'ex',
  exalted: 'ex',
  alch: 'alch',
  alt: 'alt',
  mirror: 'mirror',
  chrom: 'chrom',
  blessed: 'blessed',
  fusing: 'fuse',
  jewellers: 'jeweller',
  jew: 'jeweller',
  regal: 'regal',
  annul: 'annul',
  vaal: 'vaal',
  chance: 'chance',
  aug: 'aug',
  regret: 'regret',
  scour: 'scour',
  transmute: 'trans',
  wisdom: 'wisdom',
  portal: 'portal',
  scrap: 'scrap',
  whetstone: 'whetstone',
  gcp: 'gcp',
  bauble: 'bauble',
}

/** Returns the curated short label for a trade-API currency key, or the key
 *  itself if no label is mapped. The fallback is defensive: the unit test
 *  ensures every icon-map key has a label, so falling back at runtime is only
 *  possible if a caller passes an unknown key. */
export function getCurrencyShortLabel(currencyKey: string): string {
  return CURRENCY_SHORT_LABELS[currencyKey] ?? currencyKey
}

/** Human-readable "amount + short currency label" for a native title tooltip,
 *  e.g. formatPriceTooltip("20", "divine") -> "20 div". Currency key is
 *  optional (some chips render a non-currency icon like mirror art); when
 *  absent the tooltip is just the amount. */
export function formatPriceTooltip(displayValue: number | string, currencyKey?: string): string {
  const label = currencyKey ? getCurrencyShortLabel(currencyKey) : ''
  return `${displayValue} ${label}`.trim()
}
