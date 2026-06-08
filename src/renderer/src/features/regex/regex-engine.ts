import type { MapMod } from '../../../../shared/data/regex/map-mods'
import { MAP_MOD_OPTIMIZATIONS } from '../../../../shared/data/regex/map-mods'
import type { TokenOptimization } from '../../../../shared/data/regex/vendor/mapmods/GeneratedTypes'

/** Max character length for the in-game search field. Both PoE1 and PoE2 cap the
 *  stash / map-device / waystone search at 250 characters. The `version` param is
 *  retained so the cap can diverge again per-game without touching call sites. */
export function poeRegexMaxLength(version: 1 | 2): number {
  void version
  return 250
}

/**
 * Optimize a set of mod regex tokens using the pre-computed optimization table.
 * Greedily replaces groups of tokens with shorter combined regex strings.
 */
function optimizeTokens(mods: MapMod[]): string[] {
  if (mods.length <= 1) return mods.map((m) => m.regex)

  const remaining = new Set(mods.map((m) => m.id))
  const result: string[] = []

  // Find all matching optimizations where all IDs are in our selection
  const candidates: Array<TokenOptimization & { savings: number }> = []
  for (const opt of Object.values(MAP_MOD_OPTIMIZATIONS)) {
    if (opt.ids.every((id) => remaining.has(id))) {
      const individualLen = opt.ids.reduce((sum, id) => {
        const mod = mods.find((m) => m.id === id)
        return sum + (mod ? mod.regex.length + 1 : 0)
      }, -1)
      candidates.push({ ...opt, savings: individualLen - opt.regex.length })
    }
  }

  // Sort by savings descending, apply greedily
  candidates.sort((a, b) => b.savings - a.savings)
  for (const opt of candidates) {
    if (opt.ids.every((id) => remaining.has(id))) {
      result.push(opt.regex)
      for (const id of opt.ids) remaining.delete(id)
    }
  }

  // Add remaining individual tokens
  for (const id of remaining) {
    const mod = mods.find((m) => m.id === id)
    if (mod) result.push(mod.regex)
  }

  return result
}

/**
 * Build a PoE-compatible regex string from avoid and want mod selections.
 * Uses the optimization table for shorter output.
 */
export function buildMapRegex(avoidMods: MapMod[], wantMods: MapMod[], wantMode: 'any' | 'all'): string {
  const parts: string[] = []

  if (avoidMods.length > 0) {
    const tokens = optimizeTokens(avoidMods)
    parts.push(`"!${tokens.join('|')}"`)
  }

  if (wantMods.length > 0) {
    if (wantMode === 'any') {
      const tokens = optimizeTokens(wantMods)
      parts.push(`"${tokens.join('|')}"`)
    } else {
      for (const m of wantMods) {
        parts.push(`"${m.regex}"`)
      }
    }
  }

  return parts.join(' ')
}
