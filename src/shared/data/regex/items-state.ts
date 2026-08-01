/** State model for the PoE1 Items tab (poe.re "Item" page port): types, defaults,
 *  sanitizer, and base-catalog search helpers for the class/item pickers.
 *  Imports only GeneratedItemBases (22 KB). The 3.4 MB GeneratedItemMods dataset
 *  must NOT be imported here (or statically anywhere outside tests) - the
 *  component dynamic-imports it so it code-splits out of the main chunk. */

import { basetypes } from './vendor/item/GeneratedItemBases'

export type ItemsRarity = 'Magic' | 'Rare'
/** 'all' = each mod its own quoted term (space-AND), 'any' = one alternation,
 *  'prefixSuffix' = one quoted prefix term AND one quoted suffix term. */
export type ItemsRareMatchMode = 'all' | 'any' | 'prefixSuffix'

export interface ItemsBaseRef {
  /** Item class, e.g. "Daggers" - keys the mods dataset. */
  baseType: string
  /** Specific base name, e.g. "Glass Shank". Empty when the user picked a class
   *  only (Rare mode); Magic output requires it non-empty. */
  item: string
}

export interface ItemsRareSelection {
  /** Raw threshold input per stat numberIndex; '' or missing = no threshold. */
  values: Record<number, string>
}

export interface ItemsMagicSelection {
  basetype: string
  category: string
  /** Affix display name (stable selection key), e.g. the full tier text. */
  affixName: string
  /** Magic-name fragment the engine anchors on, e.g. "Subterranean". Persisted
   *  denormalized (upstream does the same); a dataset resync can leave it stale
   *  until the mod is re-selected. */
  affixDesc: string
  affix: 'PREFIX' | 'SUFFIX'
}

export interface ItemsState {
  itembase: ItemsBaseRef | null
  rarity: ItemsRarity
  rareMatchMode: ItemsRareMatchMode
  magicBothAffixes: boolean
  magicOpenAffix: boolean
  /** Keyed by rareModKey(). Presence = selected. Selections for other classes
   *  are retained across base switches (poe.re behavior); output filters by the
   *  active class. */
  selectedRareMods: Record<string, ItemsRareSelection>
  selectedMagicMods: ItemsMagicSelection[]
}

export const DEFAULT_ITEMS_STATE: ItemsState = {
  itembase: null,
  rarity: 'Rare',
  rareMatchMode: 'all',
  magicBothAffixes: false,
  magicOpenAffix: false,
  selectedRareMods: {},
  selectedMagicMods: [],
}

/** Upstream affixMap key shape (Item.tsx): `${basetype}-${category}-${desc}`. */
export function rareModKey(basetype: string, category: string, desc: string): string {
  return `${basetype}-${category}-${desc}`
}

/** Extract the desc back out of a rareModKey. Categories never contain '-', so
 *  the desc is everything after the first '-' past the basetype prefix. */
export function rareModKeyDesc(key: string, baseType: string): string {
  const rest = key.slice(baseType.length + 1)
  return rest.slice(rest.indexOf('-') + 1)
}

/** poe.re parity (Item.tsx nonMagicBases): classes whose name contains "heist"
 *  are rare-only. Contracts/Blueprints are NOT included - upstream quirk kept. */
export function isRareOnlyClass(baseType: string): boolean {
  return baseType.toLowerCase().includes('heist')
}

/** Alphabetized class names (dataset order is arbitrary; sorting is a UI choice
 *  with no output impact). */
const CLASS_NAMES: string[] = basetypes.map((b) => b.name).sort((a, b) => a.localeCompare(b))

/** Flattened item list for the Magic-mode typeahead, alphabetized by item name.
 *  Placeholder entries ([UNUSED], [DO NOT USE]) are dropped - deliberate
 *  divergence from poe.re, which lists them. */
const ALL_ITEM_BASES: ItemsBaseRef[] = basetypes
  .flatMap((b) => b.items.map((item) => ({ baseType: b.name, item })))
  .filter((e) => !e.item.startsWith('['))
  .sort((a, b) => a.item.localeCompare(b.item))

export function searchItemClasses(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return CLASS_NAMES
  return CLASS_NAMES.filter((n) => n.toLowerCase().includes(q))
}

export function searchItemBases(query: string, limit = 50): ItemsBaseRef[] {
  const q = query.trim().toLowerCase()
  const out: ItemsBaseRef[] = []
  for (const b of ALL_ITEM_BASES) {
    if (!q || b.item.toLowerCase().includes(q) || b.baseType.toLowerCase().includes(q)) {
      out.push(b)
      if (out.length >= limit) break
    }
  }
  return out
}

/** Coerce an untrusted persisted value into a valid ItemsState. Field-by-field
 *  merge over defaults: unknown fields drop, missing ones heal, junk resets. */
export function sanitizeItemsState(value: unknown): ItemsState {
  const s = structuredClone(DEFAULT_ITEMS_STATE)
  if (typeof value !== 'object' || value === null) return s
  const raw = value as Record<string, unknown>

  const ib = raw.itembase
  if (typeof ib === 'object' && ib !== null) {
    const b = ib as Record<string, unknown>
    if (typeof b.baseType === 'string' && b.baseType.length > 0 && typeof b.item === 'string') {
      s.itembase = { baseType: b.baseType, item: b.item }
    }
  }
  if (raw.rarity === 'Magic' || raw.rarity === 'Rare') s.rarity = raw.rarity
  if (raw.rareMatchMode === 'all' || raw.rareMatchMode === 'any' || raw.rareMatchMode === 'prefixSuffix') {
    s.rareMatchMode = raw.rareMatchMode
  }
  if (typeof raw.magicBothAffixes === 'boolean') s.magicBothAffixes = raw.magicBothAffixes
  if (typeof raw.magicOpenAffix === 'boolean') s.magicOpenAffix = raw.magicOpenAffix

  if (typeof raw.selectedRareMods === 'object' && raw.selectedRareMods !== null) {
    for (const [key, sel] of Object.entries(raw.selectedRareMods as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      if (typeof sel !== 'object' || sel === null) continue
      const values: Record<number, string> = {}
      const rawValues = (sel as Record<string, unknown>).values
      if (typeof rawValues === 'object' && rawValues !== null) {
        for (const [k, v] of Object.entries(rawValues as Record<string, unknown>)) {
          if (!/^\d+$/.test(k)) continue
          const idx = Number(k)
          if (typeof v === 'string') values[idx] = v
        }
      }
      s.selectedRareMods[key] = { values }
    }
  }

  if (Array.isArray(raw.selectedMagicMods)) {
    s.selectedMagicMods = raw.selectedMagicMods
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .filter(
        (m) =>
          typeof m.basetype === 'string' &&
          typeof m.category === 'string' &&
          typeof m.affixName === 'string' &&
          typeof m.affixDesc === 'string' &&
          (m.affix === 'PREFIX' || m.affix === 'SUFFIX'),
      )
      .map((m) => ({
        basetype: m.basetype as string,
        category: m.category as string,
        affixName: m.affixName as string,
        affixDesc: m.affixDesc as string,
        affix: m.affix as 'PREFIX' | 'SUFFIX',
      }))
  }
  return s
}
