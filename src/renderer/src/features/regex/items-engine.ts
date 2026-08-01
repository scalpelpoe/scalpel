/** Faithful port of poe.re's Item page output builder (src/pages/item/ItemOuput.ts,
 *  upstream filename typo and all) plus the small GroupUtils helpers the UI needs.
 *  See items-engine.test.ts for the parity checks against the verbatim fixture.
 *  Quirks preserved deliberately:
 *  - only stats listed in `on` get substituted INTO the regex fragment, and only
 *    on[0]; `regex.replace('\\d+', ...)` rewrites the first occurrence only
 *  - number regexes are generated dot-style then rewritten '.' -> '\d'
 *  - before/after values join with '.*' and concatenate around the fragment
 *  - prefixSuffix mode silently falls back to per-mod AND terms when either
 *    side is empty
 *  - class filtering is `key.startsWith(baseType)` (no exact segment match);
 *    no current class name is a prefix of another, so this is safe today
 *  - magic prefix descs anchor '^', suffix descs anchor '$'; the four flag
 *    combinations produce four distinct formula shapes, including the
 *    open-affix two-term output with its exact '\\s'/'\\s?' usage
 *  - upstream's unreachable "Error reading configuration" tail is dropped
 *  Scalpel-only divergences (documented, not parity-relevant):
 *  - selections whose key no longer resolves in the dataset are skipped
 *    (upstream would crash on stale persisted state)
 *  - Magic mode with an empty item name returns '' (our class-first selector
 *    allows a class-only pick; upstream always has an item) */

import type { CategoryRegex, ItemAffixRegex, ItemRegex } from '@shared/data/regex/vendor/item/GeneratedItemMods'
import type { ItemsState } from '@shared/data/regex/items-state'
import { itemsNumberRegex } from './items-number-regex'

export type ItemsAffixMap = Record<string, ItemAffixRegex>

/** Flatten the dataset into upstream Item.tsx's affixMap: keyed
 *  `${basetype}-${category}-${desc}`, later duplicates overwrite earlier ones. */
export function buildItemsAffixMap(itemRegex: Record<string, ItemRegex>): ItemsAffixMap {
  const acc: ItemsAffixMap = {}
  for (const [basetype, item] of Object.entries(itemRegex)) {
    for (const cat of item.categoryRegex) {
      for (const mod of cat.modifiers) {
        acc[`${basetype}-${cat.category}-${mod.desc}`] = mod
      }
    }
  }
  return acc
}

export function buildItemsRegex(affixMap: ItemsAffixMap, state: ItemsState): string {
  if (!state.itembase) return ''
  if (state.rarity === 'Rare') return buildRare(affixMap, state)
  if (!state.itembase.item) return ''
  return buildMagic(state)
}

function numberTerm(value: string): string {
  return itemsNumberRegex(value, false).replaceAll('.', '\\d')
}

function buildRare(affixMap: ItemsAffixMap, state: ItemsState): string {
  const baseType = state.itembase?.baseType ?? ''
  const result = Object.entries(state.selectedRareMods)
    .filter(([key]) => key.startsWith(baseType))
    .flatMap(([key, sel]) => {
      const regexInfo = affixMap[key]
      if (regexInfo === undefined) return []
      const rangeInRegex = regexInfo.on[0]
      const hasRangeInsideRegex =
        rangeInRegex !== undefined && sel.values[rangeInRegex] !== '' && sel.values[rangeInRegex] !== undefined
      const regex = hasRangeInsideRegex
        ? regexInfo.regex.replace('\\d+', numberTerm(sel.values[rangeInRegex]))
        : regexInfo.regex
      const numbersBefore = regexInfo.before
        .map((n) => sel.values[n])
        .filter((v) => v !== undefined && v !== '')
        .map((v) => numberTerm(v))
        .join('.*')
      const numbersAfter = regexInfo.after
        .map((n) => sel.values[n])
        .filter((v) => v !== undefined && v !== '')
        .map((v) => numberTerm(v))
        .join('.*')
      const str = [numbersBefore, regex, numbersAfter].filter((v) => v !== undefined && v !== '').join('.*')
      return [{ str, affixtype: regexInfo.affixtype }]
    })

  if (state.rareMatchMode === 'prefixSuffix') {
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
    return result.map((e) => `"${e.str}"`).join(' ')
  }
  if (state.rareMatchMode === 'any') {
    const regex = result.map((e) => e.str).join('|')
    return regex.length > 0 ? `"${regex}"` : ''
  }
  return result.map((e) => `"${e.str}"`).join(' ')
}

function buildMagic(state: ItemsState): string {
  const itemBase = state.itembase
  if (!itemBase) return ''
  const mods = state.selectedMagicMods.filter((e) => e.basetype === itemBase.baseType)
  const prefixes = mods.filter((e) => e.affix === 'PREFIX').map((e) => e.affixDesc)
  const suffixes = mods.filter((e) => e.affix === 'SUFFIX').map((e) => e.affixDesc)
  const item = itemBase.item

  if (!state.magicOpenAffix && !state.magicBothAffixes) {
    const prefixMatch = prefixes.length > 0 ? prefixes.map((e) => `^${e}`) : []
    const suffixMatch = suffixes.length > 0 ? suffixes.map((e) => `${e}$`) : []
    const s = prefixMatch.concat(suffixMatch).join('|')
    return s ? `"${s}"` : ''
  }
  if (!state.magicOpenAffix && state.magicBothAffixes) {
    const prefixMatch = prefixes.length > 0 ? `(${prefixes.join('|')})` : ''
    const suffixMatch = suffixes.length > 0 ? `(${suffixes.join('|')})` : ''
    return `"${prefixMatch}\\s?${item}\\s?${suffixMatch}"`
  }
  if (state.magicOpenAffix && state.magicBothAffixes) {
    const prefixMatch = prefixes.length > 0 ? `(${prefixes.join('|')})` : ''
    const suffixMatch = suffixes.length > 0 ? `(${suffixes.join('|')})` : ''
    if (prefixMatch.length === 0 && suffixMatch.length === 0) return ''
    return `"^${prefixMatch}\\s${item}|^${item}" "${item}\\s${suffixMatch}|${item}$"`
  }
  const prefixMatch = prefixes.length > 0 ? prefixes.map((e) => `^${e}`) : []
  const suffixMatch = suffixes.length > 0 ? suffixes.map((e) => `${e}$`) : []
  const s = prefixMatch
    .concat(suffixMatch)
    .concat([`^${item}`, `${item}$`])
    .join('|')
  return s ? `"${s}"` : ''
}

// ---- GroupUtils port (UI grouping; pages/item/GroupUtils.ts) -----------------

export function cleanItemsCategoryName(category: string): string {
  return category
    .replace(/suffix_?/, 'Suffix')
    .replace(/prefix_?/, 'Prefix')
    .replace('adjudicator', ' Warlord')
    .replace('basilisk', ' Hunter')
    .replace('crusader', ' Crusader')
    .replace('eyrie', ' Redeemer')
    .replace('elder', ' Elder')
    .replace('shaper', ' Shaper')
}

const CATEGORY_PRIORITY: Record<string, number> = {
  '': -1,
  shaper: 0,
  elder: 1,
  basilisk: 2,
  crusader: 3,
  eyrie: 4,
  adjudicator: 5,
}

function categoryPriority(category: string): number {
  const name = category.replace(/(prefix|suffix)_?/, '')
  return CATEGORY_PRIORITY[name] ?? Number.POSITIVE_INFINITY
}

/** Upstream RareItemSelect/MagicItemSelect pipeline: drop searing_exarch_implicit,
 *  bucket by category name with the prefix/suffix marker stripped, sort base
 *  mods first then influences. Each group is [prefixCategory, suffixCategory?]
 *  in dataset order (upstream renders index 0 left, index 1 right). */
export function groupItemsCategories(categories: CategoryRegex[]): CategoryRegex[][] {
  const filtered = categories.filter((e) => e.category !== 'searing_exarch_implicit')
  const grouped: Record<string, CategoryRegex[]> = {}
  for (const category of filtered) {
    const key = category.category.replace(/(suffix|prefix)_?/, '')
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(category)
  }
  return Object.values(grouped).sort((a, b) => categoryPriority(a[0].category) - categoryPriority(b[0].category))
}
