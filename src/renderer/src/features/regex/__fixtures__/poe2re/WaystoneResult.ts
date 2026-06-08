/* Reference implementation from poe2.re/src/pages/waystone/WaystoneResult.ts.
 * Imports rewritten to use the local fixture files. Body unchanged. */
import type { Settings } from './Settings'
import { selectedOptionRegex } from './SelectedOptionRegex'

export function generateWaystoneRegex(settings: Settings): string {
  const result = [
    generateTierRegex(settings.waystone.tier),
    generateModifiers(settings.waystone.modifier),
    generateRarity(settings.waystone.rarity),
    settings.waystone.resultSettings.customText || null,
  ].filter((e) => e !== null)

  if (result.length === 0) return ''
  return result.join(' ').trim()
}

function generateTierRegex(settings: Settings['waystone']['tier']): string | null {
  if (settings.max === 0 && settings.min === 0) return null
  if (settings.max !== 0 && settings.min > settings.max) return null
  if (settings.min < 1 || settings.max < 1) return null
  if (settings.min <= 1 && settings.max === 16) return null

  const max = settings.max === 0 ? 16 : settings.max
  const min = settings.min

  const numbersUnder10 = range(min, Math.min(10, max + 1))
  const numbersOver10 = range(Math.max(10, min), max + 1)

  const regexUnder10 =
    numbersUnder10.length <= 1
      ? `${numbersUnder10.join('')}`
      : numbersUnder10.length > 2
        ? `[${numbersUnder10[0]}-${numbersUnder10[numbersUnder10.length - 1]}]`
        : `[${numbersUnder10.join('')}]`

  const regexOver10 =
    numbersOver10.length <= 1 ? `${numbersOver10.join('')}` : `1[${numbersOver10.map((e) => e.toString()[1]).join('')}]`

  const under10 = regexUnder10 === '' ? '' : `r ${regexUnder10}\\)`
  const over10 = regexOver10 === '' ? '' : `${regexOver10}\\)`
  const result = [under10, over10].filter((e) => e !== '').join('|')
  return result === '' ? '' : `"${result}"`
}

function generateModifiers(settings: Settings['waystone']['modifier']): string | null {
  const prefixes = settings.prefixes
    .filter((e) => e.isSelected)
    .map((e) => selectedOptionRegex(e, settings.round10, settings.over100))

  const prefixesWithType =
    settings.prefixSelectType === 'any' ? prefixes.join('|') : prefixes.map((e) => `"${e}"`).join(' ')

  const goodMods = [
    settings.dropOverX ? `: \\+[${settings.dropOverValue.toString()[0]}-9]\\d\\d` : null,
    settings.delirious ? 'delir' : null,
    settings.anyPack ? 'al pac' : null,
  ].filter((e) => e !== null)

  const goodModsWithType =
    settings.prefixSelectType === 'any'
      ? `"${goodMods
          .concat(prefixesWithType)
          .filter((e) => e !== null && e !== '')
          .join('|')}"`
      : goodMods
          .map((e) => `"${e}"`)
          .concat(prefixesWithType)
          .join(' ')

  const badMods = settings.suffixes
    .filter((e) => e.isSelected)
    .map((e) => selectedOptionRegex(e, settings.round10, settings.over100))
    .join('|')

  return [
    goodMods.length + prefixes.length > 0 ? goodModsWithType : null,
    badMods.length > 0 ? `"!${badMods}"` : null,
  ].join(' ')
}

function generateRarity(settings: Settings['waystone']['rarity']): string | null {
  if (settings.uncorrupted && settings.corrupted) return null
  if (settings.corrupted) return 'corr'
  if (settings.uncorrupted) return '!corr'
  return null
}

function range(start: number, end: number): number[] {
  if (end - start <= 0) return []
  return [...Array(end - start).keys()].map((i) => i + start)
}
