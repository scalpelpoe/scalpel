import type { FlaskModGroup } from '@shared/data/regex/flask-mods'

/** Settings shape for the flask regex generator. Ported from poe-vendor-string's
 *  `FlaskSettings`, with one deliberate deviation: upstream has separate
 *  `onlyMaxPrefixTierMod` / `onlyMaxSuffixTierMod` booleans; we collapsed those into
 *  a single `flaskHighestOnly` flag because the UI exposes one "Highest Level Only"
 *  chip in the list header. `minItemLevel` therefore reports the union of both sides
 *  rather than per-side, which is fine since the chip toggles them together. */
export interface FlaskSettings {
  selectedPrefix: string[]
  selectedSuffix: string[]
  ilevel: number
  flaskHighestOnly: boolean
  matchBothPrefixAndSuffix: boolean
  ignoreEffectTiers: boolean
  matchOpenPrefixSuffix: boolean
}

const OPEN_PREFIX = '^[a-z]+ F'
const OPEN_SUFFIX = 'ask$'

export function generateFlaskOutput(modGroups: FlaskModGroup[], settings: FlaskSettings): string {
  const {
    selectedPrefix,
    selectedSuffix,
    ilevel,
    flaskHighestOnly,
    matchBothPrefixAndSuffix,
    ignoreEffectTiers,
    matchOpenPrefixSuffix,
  } = settings

  const prefixRegex = selectedPrefix
    .map((p) => {
      const mod = modGroups.find((modGroup) => modGroup.description === p)
      return mod ? findRegex(mod, ilevel, flaskHighestOnly) : undefined
    })
    .filter((v) => v !== undefined)
    .join('|')

  const suffixRegex = selectedSuffix
    .map((p) => {
      const mod = modGroups.find((modGroup) => modGroup.description === p)
      return mod ? findRegex(mod, ilevel, flaskHighestOnly) : undefined
    })
    .filter((v) => v !== undefined)
    .join('|')

  const filteredPrefixRegex = replaceEffectTier(prefixRegex, modGroups, ignoreEffectTiers)

  if (filteredPrefixRegex.length > 0 && suffixRegex.length > 0) {
    if (matchBothPrefixAndSuffix) {
      if (matchOpenPrefixSuffix) {
        return `"${OPEN_PREFIX}|${filteredPrefixRegex}" "${OPEN_SUFFIX}|${suffixRegex}"`
      } else {
        return `"${filteredPrefixRegex}" "${suffixRegex}"`
      }
    } else {
      return `"${filteredPrefixRegex}|${suffixRegex}"`
    }
  } else if (filteredPrefixRegex.length > 0) {
    return `"${filteredPrefixRegex}"`
  } else if (suffixRegex.length > 0) {
    return `"${suffixRegex}"`
  } else {
    return ''
  }
}

export function minItemLevel(modGroups: FlaskModGroup[], settings: FlaskSettings): string | undefined {
  const { selectedPrefix, selectedSuffix, ilevel, flaskHighestOnly } = settings

  if (!flaskHighestOnly) return undefined

  const prefixIlevels = selectedPrefix
    .map((modStr) => {
      const mod = modGroups.find((modGroup) => modGroup.description === modStr)
      return mod ? findIlevel(mod, ilevel) : undefined
    })
    .filter((i): i is number => i !== undefined)

  const suffixIlevels = selectedSuffix
    .map((modStr) => {
      const mod = modGroups.find((modGroup) => modGroup.description === modStr)
      return mod ? findIlevel(mod, ilevel) : undefined
    })
    .filter((i): i is number => i !== undefined)

  const itemLevels = prefixIlevels.concat(suffixIlevels)
  if (itemLevels.length === 0) {
    return undefined
  }
  const minIlevel = Math.max(...itemLevels)
  return `minimum flask item level: ${minIlevel}`
}

function replaceEffectTier(regex: string, modGroups: FlaskModGroup[], ignoreEffectTiers: boolean): string {
  if (ignoreEffectTiers) {
    const effectMod = modGroups.find((f) => f.description.includes('reduced Duration'))
    if (!effectMod) {
      return regex
    }
    const tieredEffectRegexes = effectMod.mods.map((e) => e.regex)
    const tierReplaceRegex = new RegExp(tieredEffectRegexes.join('|'))
    return regex.replace(tierReplaceRegex, effectMod.regex)
  }
  return regex
}

function findIlevel(modGroup: FlaskModGroup, ilevelNumber: number): number | undefined {
  const possibleMods = modGroup.mods.filter((m) => m.level <= ilevelNumber)
  if (possibleMods.length > 0) {
    return possibleMods.reduce((a, b) => (a.level > b.level ? a : b)).level
  }
  return undefined
}

function findRegex(modGroup: FlaskModGroup, ilevelNumber: number, onlyMaxTierMod: boolean): string | undefined {
  const possibleMods = modGroup.mods.filter((m) => m.level <= ilevelNumber)
  if (onlyMaxTierMod && possibleMods.length > 0) {
    return possibleMods.reduce((a, b) => (a.level > b.level ? a : b)).regex
  }
  if (!onlyMaxTierMod && modGroup.minLevel <= ilevelNumber) {
    return modGroup.regex
  }
  return undefined
}
