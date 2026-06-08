import type { TabletMod } from '../../../../shared/data/regex/tablet-mods'
import { generateNumberRegex } from './waystone-number-regex'

export interface TabletRarity {
  normal: boolean
  magic: boolean
}
export interface TabletType {
  breach: boolean
  delirium: boolean
  irradiated: boolean
  expedition: boolean
  ritual: boolean
  overseer: boolean
}
export interface TabletUses {
  enabled: boolean
  value: number
}
export interface TabletSelections {
  want: Set<number>
  wantMode: 'any' | 'all'
  wantValues: Record<number, number>
}
export interface TabletBuildArgs {
  mods: TabletMod[]
  rarity: TabletRarity
  type: TabletType
  uses: TabletUses
  selections: TabletSelections
  round10: boolean
  customText?: string
}

/** Faithful port of poe2.re's generateTabletRegex (src/pages/tablet/TabletResult.ts).
 *  Mirrors output bug-for-bug; see tablet-engine.test.ts for the parity check. */
export function buildTabletRegex(args: TabletBuildArgs): string {
  const result = [
    rarityRegex(args.rarity),
    typeRegex(args.type),
    args.uses.enabled ? usesRemainingRegex(args.uses.value) : null,
    ...modifierRegex(args.mods, args.selections, args.round10),
    args.customText || null,
  ].filter((e): e is string => e !== null && e !== '')
  if (result.length === 0) return ''
  return result.join(' ').trim()
}

/** Mirrors poe2.re selectedOptionRegex: a chosen magnitude prefixes the mod token.
 *  A falsy value yields the bare regex (matches their `if (option.value)`). */
function affixToken(mod: TabletMod, value: number | undefined, round10: boolean): string {
  if (!value) return mod.regex
  return `${generateNumberRegex(String(value), round10, false)}.*${mod.regex}`
}

function modifierRegex(mods: TabletMod[], selections: TabletSelections, round10: boolean): string[] {
  const affixes = mods
    .filter((m) => selections.want.has(m.id))
    .map((m) => affixToken(m, selections.wantValues[m.id], round10))
  if (affixes.length === 0) return []
  if (selections.wantMode === 'all') return affixes.map((e) => `"${e}"`)
  return [`"${affixes.join('|')}"`]
}

function rarityRegex(rarity: TabletRarity): string | null {
  if ((rarity.normal && rarity.magic) || (!rarity.normal && !rarity.magic)) return null
  const result = [rarity.normal ? 'n' : '', rarity.magic ? 'm' : ''].filter((e) => e.length > 0).join('|')
  if (result.length === 0) return null
  if (result.length === 1) return `"y: ${result}"`
  return `"y: (${result})"`
}

function typeRegex(type: TabletType): string | null {
  const all = type.breach && type.delirium && type.irradiated && type.expedition && type.ritual && type.overseer
  const none = !type.breach && !type.delirium && !type.irradiated && !type.expedition && !type.ritual && !type.overseer
  if (all || none) return null
  const result = [
    type.breach ? 'eac' : '',
    type.delirium ? 'liri' : '',
    type.irradiated ? 'rra' : '',
    type.expedition ? 'xped' : '',
    type.ritual ? 'tual' : '',
    type.overseer ? 'eer' : '',
  ]
    .filter((e) => e.length > 0)
    .join('|')
  if (result.length === 0) return null
  if (result.length === 1) return `"${result}"`
  return `"(${result})"`
}

function usesRemainingRegex(n: number): string | null {
  if (n < 1 || n > 18) return null
  const numberRegex = n < 10 ? `(${n === 9 ? '9' : `[${n}-9]`}|1[0-8])` : `(1[${n % 10}-8])`
  return `"${numberRegex} us"`
}
