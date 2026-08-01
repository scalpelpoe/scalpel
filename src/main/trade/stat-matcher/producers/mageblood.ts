import { getPoeVersion } from '@main/game-state'
import type { StatFilter } from '../../trade'
import type { ItemInfo } from '../context'

// Every Mage's Legacy shares the base trade stat explicit.stat_264262054, but the
// LIVE trade2 /data/stats bakes the specific Legacy into the id as a "|N" suffix
// (explicit.stat_264262054|11 = "Legacy of Silver", |13 = "Legacy of Sulphur",
// ...) with the full text and NO option field -- not the single option-stat EE2's
// stats.ndjson models. So a Legacy chip is detected by id prefix, and its identity
// is the whole suffixed id.
const LEGACY_STAT_PREFIX = 'explicit.stat_264262054'
const EFFECT_STAT_ID = 'explicit.stat_3874491706'
const CHARM_SLOTS_STAT_IDS = new Set(['explicit.stat_1416292992', 'implicit.stat_1416292992'])

function isLegacyChip(f: StatFilter): boolean {
  return f.id === LEGACY_STAT_PREFIX || f.id.startsWith(`${LEGACY_STAT_PREFIX}|`)
}

// Mageblood always carries exactly 4 Mage's Legacies. duplicates = 4 - distinctCount,
// where distinctCount is the number of DISTINCT Legacies (distinct suffixed ids). This
// is robust whether the clipboard lists all four lines or collapses identical Legacies:
// duplicate lines share an id and merge upstream, and this dedups by id regardless.
export function postProcessMageblood(filters: StatFilter[], itemInfo?: ItemInfo): StatFilter[] {
  if (getPoeVersion() !== 2 || itemInfo?.rarity !== 'Unique' || itemInfo?.name !== 'Mageblood') return filters

  const legacyChips = filters.filter(isLegacyChip)
  if (legacyChips.length === 0) return filters

  // Collapse to one chip per distinct Legacy id (option is baked into the id).
  const seen = new Map<string, StatFilter>()
  for (const chip of legacyChips) {
    if (!seen.has(chip.id)) {
      seen.set(chip.id, {
        ...chip,
        value: null,
        min: null,
        max: null,
        enabled: true,
        premium: true,
        type: 'mageblood-legacy',
      })
    }
  }
  const distinctLegacyChips = [...seen.values()]
  const duplicates = 4 - distinctLegacyChips.length
  const hasDuplicates = duplicates > 0

  const dupChip: StatFilter = {
    id: 'mageblood-duplicates',
    text: `Duplicates: ${duplicates}`,
    value: duplicates,
    min: duplicates,
    max: null,
    enabled: hasDuplicates,
    // Flag premium so Base mode (auto-applied on every unique price-check open) keeps
    // the Duplicates constraint enabled instead of stripping it like a plain explicit/
    // pseudo row. Only when there are duplicates -- a "Duplicates: 0" search is a no-op.
    premium: hasDuplicates || undefined,
    type: 'mageblood-dup',
  }

  const rest = filters
    .filter((f) => !isLegacyChip(f))
    .map((f) => {
      if (f.id === EFFECT_STAT_ID || CHARM_SLOTS_STAT_IDS.has(f.id)) {
        return { ...f, enabled: true, premium: true }
      }
      return f
    })

  return [...rest, ...distinctLegacyChips, dupChip]
}
