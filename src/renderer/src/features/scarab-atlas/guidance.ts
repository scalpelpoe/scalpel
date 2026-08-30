/** User-facing copy for Scarab Atlas guidance. Keep jargon out of the default path. */

export const GUIDE_DISMISS_KEY = 'scarab-atlas-guide-dismissed'
export const ADVANCED_DELTAS_KEY = 'scarab-atlas-show-deltas'

export const TAB_BLURBS: Record<'calculator' | 'vendor' | 'weights', string> = {
  calculator:
    'Plan your atlas tree for scarab drops. Block junk categories, boost valuable ones, then mirror those choices in-game.',
  vendor:
    'Separate from the atlas: find cheap scarabs to sell 3-for-1 to the vendor when the random return is worth more.',
  weights:
    'Advanced. Override drop weights or chaos prices if you disagree with the defaults. Most players can skip this.',
}

export const HOW_TO_STEPS = [
  {
    title: 'Prices load from your league',
    body: 'Uses Scalpel’s active league (shown in the subtitle). Wait until “priced” looks full.',
  },
  {
    title: 'Press Optimize',
    body: 'Applies suggested Block / Boost / Invest on this list. That is what to put on your atlas tree.',
  },
  {
    title: 'Mirror it in Path of Exile',
    body: 'Take those same blocks and “more scarabs” / investment notables on your real atlas.',
  },
  {
    title: 'Optional: Vendor Guide',
    body: 'Use the other tab to dump worthless scarabs via the 3→1 vendor recipe.',
  },
] as const

export const EV_LABELS = {
  baseline: {
    label: 'No bias',
    hint: 'Average chaos value of a random scarab drop with no blocks, boosts, or invests.',
  },
  current: {
    label: 'Your setup',
    hint: 'Average drop value with the Block / Boost / Invest buttons you have selected below.',
  },
  optimal: {
    label: 'Recommended',
    hint: 'Best average drop value this tool’s strategy found. Press Optimize to apply it.',
  },
} as const

export function atlasModifierLabel(mod: 'none' | 'blockable' | 'boostable'): string {
  switch (mod) {
    case 'blockable':
      return 'Can block'
    case 'boostable':
      return 'Can boost ×2'
    default:
      return 'No atlas lever'
  }
}

export function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === '1'
  } catch {
    return fallback
  }
}

export function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}
