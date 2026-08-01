import type { DefenceBounds } from '@shared/data/items/defence-bounds'
import type { DefenseValues } from './context'

// PoE1 randomised base defences: each armour piece rolls an integer base value
// per defence inside the per-base range, and the trade site indexes the roll
// position as armour_filters.base_defence_percentile. The game never prints the
// percentile in the item copy, so we recover the roll from the displayed value.
//
// Model - probe-validated against ~80 live listings' own
// extended.base_defence_percentile (docs/superpowers/specs, 2026-07-04):
//   displayed  = round((base + localFlat) * (1 + localIncr/100) * (1 + quality/100))
//   percentile = round(100 * (base - min) / (max - min))   <- GGG's own mapping
// Quality is multiplicative with increased-mods (additive variants fail on live
// data) and the display rounds (floor variants leave half the items unsolvable).
// Solve the single WIDEST-span displayed defence; intersecting defences
// over-tightens on hybrid bases (per-defence quantization couples imperfectly).
// When several rolls collide on one displayed value, return the honest range.

// Local mod text per defence, ported from Awakened PoE Trade's QUALITY_STATS
// (battle-tested list of every local flat/increased text that scales a
// defence). "reduced" variants contribute negatively.
const DEFENCE_MODS: Record<'ar' | 'ev' | 'es' | 'ward', { flat: RegExp; incr: RegExp }> = {
  ar: {
    flat: /^\+(\d+) to Armour$/,
    incr: /^(\d+)% (increased|reduced) (?:Armour|Armour and Energy Shield|Armour and Evasion|Armour, Evasion and Energy Shield)$/,
  },
  ev: {
    flat: /^\+(\d+) to Evasion Rating$/,
    incr: /^(\d+)% (increased|reduced) (?:Evasion Rating|Armour and Evasion|Evasion and Energy Shield|Armour, Evasion and Energy Shield)$/,
  },
  es: {
    flat: /^\+(\d+) to maximum Energy Shield$/,
    incr: /^(\d+)% (increased|reduced) (?:Energy Shield|Armour and Energy Shield|Evasion and Energy Shield|Armour, Evasion and Energy Shield)$/,
  },
  ward: {
    flat: /^\+(\d+) to Ward$/,
    incr: /^(\d+)% (increased|reduced) Ward$/,
  },
}

// Clipboard mod lines carry trailing source annotations; strip before matching.
const LINE_ANNOTATION = /\s*\((?:implicit|crafted|fractured|enchant|scourge|crucible|mutated)\)$/i

function sumMods(modLines: string[], key: 'ar' | 'ev' | 'es' | 'ward'): { flat: number; incr: number } {
  const { flat: flatRe, incr: incrRe } = DEFENCE_MODS[key]
  let flat = 0
  let incr = 0
  for (const raw of modLines) {
    const line = raw.replace(LINE_ANNOTATION, '').trim()
    const f = line.match(flatRe)
    if (f) {
      flat += parseInt(f[1], 10)
      continue
    }
    const inc = line.match(incrRe)
    if (inc) incr += (inc[2] === 'reduced' ? -1 : 1) * parseInt(inc[1], 10)
  }
  return { flat, incr }
}

export function computeBasePercentile(input: {
  bounds: DefenceBounds
  defenses: DefenseValues
  quality: number
  modLines: string[]
}): { lo: number; hi: number } | null {
  const { bounds, defenses, quality, modLines } = input

  // Pick the displayed defence with the largest roll span: more integer steps
  // means finer discrimination between neighbouring rolls, and the probe shows
  // the widest span alone reproduces GGG's indexed percentile.
  const displayedByKey: Record<'ar' | 'ev' | 'es' | 'ward', number> = {
    ar: defenses.armour,
    ev: defenses.evasion,
    es: defenses.energyShield,
    ward: defenses.ward,
  }
  let pick: { key: 'ar' | 'ev' | 'es' | 'ward'; range: [number, number]; displayed: number } | null = null
  for (const key of ['ar', 'ev', 'es', 'ward'] as const) {
    const range = bounds[key]
    const displayed = displayedByKey[key]
    if (!range || displayed <= 0) continue
    if (!pick || range[1] - range[0] > pick.range[1] - pick.range[0]) {
      pick = { key, range, displayed }
    }
  }
  if (!pick) return null

  const [min, max] = pick.range
  const { flat, incr } = sumMods(modLines, pick.key)
  const multiplier = (1 + incr / 100) * (1 + quality / 100)

  // The display is monotone in the base (multiplier is always positive), so
  // matching rolls form a contiguous run; first and last bound the range.
  const candidates: number[] = []
  for (let base = min; base <= max; base++) {
    if (Math.round((base + flat) * multiplier) === pick.displayed) candidates.push(base)
  }
  if (candidates.length === 0) return null

  const span = max - min
  const pctOf = (b: number) => Math.min(100, Math.max(0, Math.round((100 * (b - min)) / span)))
  return { lo: pctOf(candidates[0]), hi: pctOf(candidates[candidates.length - 1]) }
}
