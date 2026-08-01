/** Resolves what a saved preset should actually paste. Beasts presets store
 *  settings rather than a regex so they can be re-priced; every other generator
 *  stores a finished string and passes straight through.
 *
 *  Dependencies are injected (matching applyRegexPreset's shape) so this stays
 *  unit-testable without mocking electron - beast-prices pulls in the net stack
 *  through prices.ts. */

import { deriveBeastPresetRegex, type BeastPriceLine } from '@shared/data/regex/beast-engine'
import type { RegexPreset } from '@shared/types'

export interface BeastPresetDeps {
  /** Cached beast prices for the league, or null when cold. Must not fetch. */
  peek: (league: string) => BeastPriceLine[] | null
  /** Fire-and-forget refresh so the next apply has fresh prices. */
  warm: (league: string) => void
}

export function resolvePresetRegex(preset: RegexPreset, league: string, deps: BeastPresetDeps): string | undefined {
  if (preset.generator !== 'beasts' || !preset.beast) return preset.regex
  const lines = deps.peek(league)
  if (!lines) {
    deps.warm(league)
    return preset.regex
  }
  // An empty derive (every beast filtered out at today's prices) falls back
  // rather than pasting an empty string over the user's search box.
  return deriveBeastPresetRegex(preset, lines) || preset.regex
}
