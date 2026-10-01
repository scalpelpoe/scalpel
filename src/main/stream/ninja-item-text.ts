import { getItemClasses } from '@shared/data/items/item-classes'
import { stripTradeTokens } from '@shared/game-text'
import { splitRuneTier } from '@shared/poe-item'
import type { NinjaItemData, NinjaProperty } from './sources/ninja-types'

/** Rebuilds the PoE2 Ctrl+C text for an item poe.ninja serves as GGG item JSON, so
 *  Scalpel's own parseItemText (and everything downstream of it) sees the same
 *  input a hotkey copy gives it. Basic-copy shape, no advanced-mod headers: the
 *  parser reads (implicit)/(rune)/(enchant)/(fractured) line suffixes, and takes
 *  the LAST non-implicit, non-rune mod section as the explicits. */

const RARITY = ['Normal', 'Magic', 'Rare', 'Unique'] as const

/** GGG's filter-list class is not always the clipboard's (tower shields and targes
 *  both copy as "Shields"; item-classes-poe2.json already collapses them). Base
 *  names listed here win over the data lookup. Empty until a base is found that
 *  the data resolves wrongly. */
const CLASS_OVERRIDES: Record<string, string> = {}

let baseToClass: Map<string, string> | null = null

function classForBase(base: string): string | null {
  if (!baseToClass) {
    // Built on first use: getPoeVersion() is not reliable at module load, and PoE2
    // is the only game Scalpel Stream serves, so the version is fixed to 2.
    baseToClass = new Map()
    for (const [cls, info] of Object.entries(getItemClasses(2))) {
      for (const b of info.bases) if (!baseToClass.has(b.name)) baseToClass.set(b.name, cls)
    }
  }
  return CLASS_OVERRIDES[base] ?? baseToClass.get(base) ?? null
}

/** Colour 0 is plain; any other colour marks a modified (augmented) value. */
function valueText(v: NinjaProperty['values'][number]): string {
  return v[1] !== 0 ? `${v[0]} (augmented)` : String(v[0])
}

function propertyLine(p: NinjaProperty): string | null {
  // Header entries ("Helmet", "[Mace|One Hand Mace]") carry no values.
  if (p.values.length === 0) return null
  // displayMode 3 is a template: "Lasts {0} Seconds" filled from the values.
  if (p.displayMode === 3) {
    return stripTradeTokens(p.name).replace(/\{(\d+)\}/g, (_, i) => {
      const v = p.values[Number(i)]
      return v ? valueText(v) : ''
    })
  }
  return `${stripTradeTokens(p.name)}: ${p.values.map(valueText).join(', ')}`
}

function requirementsLine(raw: NinjaItemData): string | null {
  const parts = raw.requirements
    .filter((r) => r.values.length > 0)
    .map((r) => {
      const name = stripTradeTokens(r.name)
      const value = r.values[0][0]
      return name === 'Level' ? `Level ${value}` : `${value} ${name}`
    })
  return parts.length > 0 ? `Requires: ${parts.join(', ')}` : null
}

/** Bonded lines only apply while a Shaman-bonded rune sits in the matching slot
 *  and the clipboard never prints them as socketed-rune lines. */
const BONDED = /^\[ShamanOnlyMods\|Bonded\]/

function tagged(mods: string[], tag: string | null): string[] {
  return mods.map((m) => {
    const line = stripTradeTokens(m).trim()
    return tag ? `${line} (${tag})` : line
  })
}

/** Returns null when the item class can't be resolved or the frame isn't gear. */
export function ninjaItemText(raw: NinjaItemData): string | null {
  const rarity = raw.frameType != null ? RARITY[raw.frameType] : undefined
  if (!rarity) return null
  // The base type: magic items carry the generated title in typeLine, so the
  // lookup key comes from baseType. Runeforged/Runemastered stay on the printed
  // base type but are not part of the class lookup.
  const base = raw.baseType ?? raw.typeLine
  const itemClass = classForBase(splitRuneTier(base).bare)
  if (!itemClass) return null

  const sections: string[][] = []
  const add = (lines: string[]): void => {
    if (lines.length > 0) sections.push(lines)
  }

  const header = [`Item Class: ${itemClass}`, `Rarity: ${rarity}`]
  const unidentified = raw.identified === false
  if ((rarity === 'Rare' || rarity === 'Unique') && raw.name && !unidentified) header.push(raw.name)
  header.push(raw.typeLine)
  add(header)

  add(raw.properties.map(propertyLine).filter((l): l is string => l != null))

  const requires = requirementsLine(raw)
  if (requires) add([requires])

  const rune = raw.sockets.filter((s) => s.type === 'rune')
  if (rune.length > 0) add([`Sockets: ${rune.map(() => 'S').join(' ')} `])

  if (raw.ilvl != null) add([`Item Level: ${raw.ilvl}`])

  add(tagged(raw.enchantMods, 'enchant'))
  add(
    tagged(
      raw.runeMods.filter((m) => !BONDED.test(m)),
      'rune',
    ),
  )
  add(tagged(raw.implicitMods, 'implicit'))
  // poe.ninja files fractured, desecrated and crafted mods in their own arrays;
  // the clipboard prints them all in the one explicit block. Only fractured gets a
  // suffix: no PoE2 fixture prints one for desecrated or crafted lines.
  add([
    ...tagged(raw.explicitMods, null),
    ...tagged(raw.fracturedMods, 'fractured'),
    ...tagged(raw.desecratedMods, null),
    ...tagged(raw.craftedMods, null),
  ])

  if (unidentified) add(['Unidentified'])
  if (raw.sanctified) add(['Sanctified'])
  if (raw.corrupted) add([raw.doubleCorrupted ? 'Twice Corrupted' : 'Corrupted'])

  return sections.map((s) => s.join('\n')).join('\n--------\n')
}
