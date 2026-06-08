/* Verbatim copy of poe2.re's src/pages/tablet/TabletResult.ts (veiset/poe2.re),
 * used as a parity reference only. Only the import paths differ from upstream.
 * Do not refactor - drift from upstream is what the parity test catches. */
import { Settings } from './Settings'
import { selectedOptionRegex } from './SelectedOptionRegex'

export function generateTabletRegex(settings: Settings): string {
  const result = [
    generateRarityRegex(settings.tablet.rarity),
    generateTypeRegex(settings.tablet.type),
    settings.tablet.modifier.usesRemaining ? generateUsesRemainingRegex(settings.tablet.modifier) : null,
    ...generateModifierRegex(settings.tablet.modifier),
    settings.tablet.resultSettings.customText || null,
  ].filter((e) => e !== null && e !== '')

  if (result.length === 0) return ''
  return result.join(' ').trim()
}

function generateModifierRegex(settings: Settings['tablet']['modifier']): string[] {
  const affixes = settings.affixes
    .filter((e) => e.isSelected)
    .map((e) => selectedOptionRegex(e, settings.round10, false))
  if (affixes.length === 0) return []
  if (settings.affixSelectType === 'all') {
    return affixes.map((e) => `"${e}"`)
  }
  return [`"${affixes.join('|')}"`]
}

function generateRarityRegex(settings: Settings['tablet']['rarity']): string | null {
  if ((settings.normal && settings.magic) || (!settings.normal && !settings.magic)) {
    return null
  }
  const normalRegex = settings.normal ? 'n' : ''
  const magicRegex = settings.magic ? 'm' : ''
  const result = [normalRegex, magicRegex].filter((e) => e.length > 0).join('|')
  if (result.length === 0) return null
  if (result.length === 1) return `"y: ${result}"`
  if (result.length > 1) return `"y: (${result})"`
  return null
}

function generateTypeRegex(settings: Settings['tablet']['type']): string | null {
  if (
    (settings.breach &&
      settings.delirium &&
      settings.irradiated &&
      settings.expedition &&
      settings.ritual &&
      settings.overseer) ||
    (!settings.breach &&
      !settings.delirium &&
      !settings.irradiated &&
      !settings.expedition &&
      !settings.ritual &&
      !settings.overseer)
  ) {
    return null
  }
  const breachRegex = settings.breach ? 'eac' : ''
  const deliriumRegex = settings.delirium ? 'liri' : ''
  const irradiatedRegex = settings.irradiated ? 'rra' : ''
  const expeditionRegex = settings.expedition ? 'xped' : ''
  const ritualRegex = settings.ritual ? 'tual' : ''
  const overseerRegex = settings.overseer ? 'eer' : ''
  const result = [breachRegex, deliriumRegex, irradiatedRegex, expeditionRegex, ritualRegex, overseerRegex]
    .filter((e) => e.length > 0)
    .join('|')
  if (result.length === 0) return null
  if (result.length === 1) return `"${result}"`
  if (result.length > 1) return `"(${result})"`
  return null
}

function generateUsesRemainingRegex(settings: Settings['tablet']['modifier']): string | null {
  const n = settings.numUsesRemaining
  if (n < 1 || n > 18) {
    return null
  }
  let numberRegex: string
  if (n < 10) {
    numberRegex = `(${n === 9 ? '9' : `[${n}-9]`}|1[0-8])`
  } else {
    numberRegex = `(1[${n % 10}-8])`
  }
  return `"${numberRegex} us"`
}
