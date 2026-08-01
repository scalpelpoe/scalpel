import type { TabletMod } from '@shared/data/regex/tablet-mods'
import { generateBoundedValueRegex, generateNumberRegex } from './waystone-number-regex'
import { generateRarityRegex } from './rarity-regex'

export interface TabletRarity {
  normal: boolean
  magic: boolean
  rare: boolean
}
export interface TabletType {
  irradiated: boolean
  ritual: boolean
  delirium: boolean
  breach: boolean
  abyss: boolean
  temple: boolean
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
    generateRarityRegex(args.rarity),
    typeRegex(args.type),
    args.uses.enabled ? usesRemainingRegex(args.uses.value) : null,
    ...modifierRegex(args.mods, args.selections, args.round10),
    args.customText || null,
  ].filter((e): e is string => e !== null && e !== '')
  if (result.length === 0) return ''
  return result.join(' ').trim()
}

/** Mirrors poe2.re selectedOptionRegex (current vintage): bounded [value..modMax]
 *  range anchored on the range paren; bare regex for falsy values; legacy scalar
 *  form for rangeless mods (unreachable via the UI, guarded for stale presets). */
function affixToken(mod: TabletMod, value: number | undefined, round10: boolean): string {
  if (!value) return mod.regex
  const rangeMax = mod.ranges[0]?.length === 2 ? mod.ranges[0][1] : undefined
  if (rangeMax === undefined) return `${generateNumberRegex(String(value), round10, false)}.*${mod.regex}`
  return `${generateBoundedValueRegex(String(value), String(rangeMax), round10, false)}.*${mod.regex}`
}

function modifierRegex(mods: TabletMod[], selections: TabletSelections, round10: boolean): string[] {
  const affixes = mods
    .filter((m) => selections.want.has(m.id))
    .map((m) => affixToken(m, selections.wantValues[m.id], round10))
  if (affixes.length === 0) return []
  if (selections.wantMode === 'all') return affixes.map((e) => `"${e}"`)
  return [`"${affixes.join('|')}"`]
}

function typeRegex(type: TabletType): string | null {
  const all =
    type.irradiated && type.ritual && type.delirium && type.breach && type.abyss && type.temple && type.overseer
  const none =
    !type.irradiated && !type.ritual && !type.delirium && !type.breach && !type.abyss && !type.temple && !type.overseer
  if (all || none) return null
  const result = [
    type.irradiated ? 'rra' : '',
    type.ritual ? 'tual' : '',
    type.delirium ? 'liri' : '',
    type.breach ? 'eac' : '',
    type.abyss ? 'byss' : '',
    type.temple ? 'empl' : '',
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
