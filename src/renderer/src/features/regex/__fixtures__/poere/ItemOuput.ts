// Verbatim from poe.re (veiset/poe-vendor-string) src/pages/item/ItemOuput.ts
// (upstream filename typo kept; modulo Biome formatting applied by the
// pre-commit hook, semantics unchanged). Only the imports are adapted to
// fixture-local types. Parity fixture - do not edit. When parity fails, fix
// the port.
import type { RareModSelection, ItemAffixRegex, ItemCraftingSettings } from './ItemTypes'
import { generateNumberRegex } from './GenerateNumberRegex'

type RareModSelectionEntry = {
  key: string
  value: RareModSelection
  regex: ItemAffixRegex
}

const openPrefix = (item: string) => `^${item}`
const openSuffix = (item: string) => `${item}$`

export function generateMagicItemRegex(settings: ItemCraftingSettings) {
  const itemBase = settings.itembase
  const selectedMods = settings.selectedMagicMods
  if (!itemBase) return ''
  const mods = selectedMods.filter((e) => e.basetype === itemBase.baseType)
  const prefixes = mods.filter((e) => e.affix === 'PREFIX').map((e) => e.regex.desc)
  const suffixes = mods.filter((e) => e.affix === 'SUFFIX').map((e) => e.regex.desc)

  if (!settings.magicSettings.matchOpenAffix && !settings.magicSettings.onlyIfBothPrefixAndSuffix) {
    const prefixMatch = prefixes.length > 0 ? prefixes.map((e) => `^${e}`) : []
    const suffixMatch = suffixes.length > 0 ? suffixes.map((e) => `${e}$`) : []
    const s = prefixMatch
      .concat(suffixMatch)
      .filter((e) => e !== null)
      .join('|')
    return s ? `"${s}"` : ''
  } else if (!settings.magicSettings.matchOpenAffix && settings.magicSettings.onlyIfBothPrefixAndSuffix) {
    const prefixMatch = prefixes.length > 0 ? `(${prefixes.join('|')})` : ''
    const suffixMatch = suffixes.length > 0 ? `(${suffixes.join('|')})` : ''
    return `"${prefixMatch}\\s?${itemBase.item}\\s?${suffixMatch}"`
  } else if (settings.magicSettings.matchOpenAffix && settings.magicSettings.onlyIfBothPrefixAndSuffix) {
    const prefixMatch = prefixes.length > 0 ? `(${prefixes.join('|')})` : ''
    const suffixMatch = suffixes.length > 0 ? `(${suffixes.join('|')})` : ''
    const item = itemBase.item
    if (prefixMatch.length === 0 && suffixMatch.length === 0) return ''
    return `"^${prefixMatch}\\s${item}|${openPrefix(item)}" "${item}\\s${suffixMatch}|${openSuffix(item)}"`
  } else if (settings.magicSettings.matchOpenAffix && !settings.magicSettings.onlyIfBothPrefixAndSuffix) {
    const prefixMatch = prefixes.length > 0 ? prefixes.map((e) => `^${e}`) : []
    const suffixMatch = suffixes.length > 0 ? suffixes.map((e) => `${e}$`) : []
    const item = itemBase.item
    const s = prefixMatch
      .concat(suffixMatch)
      .concat([openPrefix(item), openSuffix(item)])
      .filter((e) => e !== null)
      .join('|')
    return s ? `"${s}"` : ''
  }
  return 'Error reading configuration'
}

export function generateRareItemRegex(
  affixMap: Record<string, ItemAffixRegex>,
  settings: ItemCraftingSettings,
): string {
  const itemBase = settings.itembase
  const selectedMods = settings.selectedRareMods

  if (!itemBase) return ''

  const mods: RareModSelectionEntry[] = Object.entries(selectedMods).map(([key, value]) => ({
    key,
    value,
    regex: affixMap[key],
  }))

  const result = mods
    .filter((e) => e.value.selected)
    .filter((e) => e.key.startsWith(itemBase.baseType))
    .map((e) => {
      const rangeInRegex = e.regex.on[0]
      const hasRangeInsideRegex =
        rangeInRegex !== undefined && e.value.values[rangeInRegex] !== '' && e.value.values[rangeInRegex] !== undefined
      const regex = hasRangeInsideRegex
        ? e.regex.regex.replace('\\d+', generateNumberRegex(e.value.values[rangeInRegex], false).replaceAll('.', '\\d'))
        : e.regex.regex
      const numbersBefore = e.regex.before
        .map((number) => e.value.values[number])
        .filter((e) => e !== undefined && e !== '')
        .map((f) => generateNumberRegex(f, false).replaceAll('.', '\\d'))
        .join('.*')
      const numbersAfter = e.regex.after
        .map((number) => e.value.values[number])
        .filter((e) => e !== undefined && e !== '')
        .map((f) => generateNumberRegex(f, false).replaceAll('.', '\\d'))
        .join('.*')

      const regexStr = [numbersBefore, regex, numbersAfter].filter((e) => e !== undefined && e !== '').join('.*')

      return {
        str: regexStr,
        affixtype: e.regex.affixtype,
      }
    })

  if (settings.rareSettings.matchPrefixAndSuffix) {
    const prefixes = result
      .filter((e) => e.affixtype === 'PREFIX')
      .map((e) => e.str)
      .join('|')
    const suffixes = result
      .filter((e) => e.affixtype === 'SUFFIX')
      .map((e) => e.str)
      .join('|')

    if (prefixes && suffixes) {
      return `"${prefixes}" "${suffixes}"`
    }
    // Fallback to default behavior if one of the categories is empty
    return result.map((e) => `"${e.str}"`).join(' ')
  } else if (settings.rareSettings.matchAnyMod) {
    const regex = result.map((e) => e.str).join('|')
    return regex.length > 0 ? `"${regex}"` : ''
  } else {
    return result.map((e) => `"${e.str}"`).join(' ')
  }
  // return result.join("|");
}
