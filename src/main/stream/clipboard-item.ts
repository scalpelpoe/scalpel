import {
  LIMITS,
  type ModLine,
  type ModSection,
  type PriceCheck,
  POECDN_PREFIX,
  type Slot,
  type SnapshotItem,
} from '@scalpel/stream-contract'
import { stripTradeTokens } from '@shared/game-text'
import type { PoeItem } from '@shared/types'
import { clip } from './text'

/** Hotkey slot patches: the streamer hovers a freshly equipped item and presses
 *  "Update Stream Slot"; Scalpel's usual single copy gives us its text, which
 *  this module turns into a snapshot item and a paperdoll slot. The advanced
 *  copy carries prefix/suffix tiers directly, so no tier lookup is needed. */

export type PaperdollSide = 'left' | 'right'

const ARMOUR_SLOTS: Record<string, Slot> = {
  Helmets: 'Helm',
  'Body Armours': 'BodyArmour',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Belts: 'Belt',
  Amulets: 'Amulet',
}

const OFF_HAND_CLASSES = new Set(['Quivers', 'Shields', 'Foci', 'Bucklers'])

const TWO_HANDED = /^(Two Hand|Bows|Crossbows|Staves|Quarterstaves|Warstaves)/

const WEAPON_CLASSES =
  /^(One Hand|Two Hand|Bows|Crossbows|Wands|Sceptres|Staves|Quarterstaves|Warstaves|Spears|Flails|Claws|Daggers|Talismans|Traps)/

/** Which paperdoll slot a hovered equipped item sits in. `side` is which half of
 *  the inventory panel the cursor was over; it settles left vs right ring and
 *  main hand vs off hand. Flasks, charms and jewels aren't patchable. */
export function slotForItem(item: PoeItem, side: PaperdollSide, activeWeaponSet: 1 | 2): Slot | null {
  const cls = item.itemClass
  const armour = ARMOUR_SLOTS[cls]
  if (armour) return armour
  if (cls === 'Rings') return side === 'left' ? 'Ring' : 'Ring2'
  const set2 = activeWeaponSet === 2
  if (OFF_HAND_CLASSES.has(cls)) return set2 ? 'Offhand2' : 'Offhand'
  if (WEAPON_CLASSES.test(cls)) {
    const offHand = side === 'right' && !TWO_HANDED.test(cls)
    if (offHand) return set2 ? 'Offhand2' : 'Offhand'
    return set2 ? 'Weapon2' : 'Weapon'
  }
  return null
}

/** Cursor x left of the paperdoll's centre line counts as the left side. The
 *  inventory panel is `height * sidebarRatio` wide at the window's right edge. */
export function paperdollSide(
  cursorX: number,
  game: { x: number; width: number; height: number },
  sidebarRatio: number,
): PaperdollSide {
  const centre = game.x + game.width - (game.height * sidebarRatio) / 2
  return cursorX < centre ? 'left' : 'right'
}

const RARITY: Record<PoeItem['rarity'], SnapshotItem['rarity']> = {
  Normal: 'normal',
  Magic: 'magic',
  Rare: 'rare',
  Unique: 'unique',
  Gem: 'gem',
  Currency: 'currency',
}

/** Advanced copies print each roll with its tier range ("+72(70-84) to maximum
 *  Life") and tag some lines ("(implicit)"); viewers get the plain in-game text. */
const INLINE_RANGE = /\((?:-?\d+(?:\.\d+)?)-(?:-?\d+(?:\.\d+)?)\)/g
const LINE_TAG = /\s*\((?:implicit|enchant|rune|crafted|fractured|desecrated|augmented)\)\s*$/i

function displayText(line: string): string {
  return clip(stripTradeTokens(line).replace(INLINE_RANGE, '').replace(LINE_TAG, '').trim())
}

function plainLines(texts: string[] | undefined): ModLine[] {
  return (texts ?? [])
    .map(displayText)
    .filter(Boolean)
    .map((text) => ({ text }))
}

// No PoE2 clipboard fixture marks desecrated lines (the suffix is stripped by LINE_TAG, never emitted), so none are flagged here.
function explicitLines(item: PoeItem): ModLine[] {
  const advanced = (item.advancedMods ?? []).filter((m) => m.type === 'prefix' || m.type === 'suffix')
  if (advanced.length === 0) return plainLines(item.explicits)
  return advanced.flatMap((mod) => {
    const affix = mod.type as 'prefix' | 'suffix'
    const range = mod.ranges.length === 1 ? { min: mod.ranges[0].min, max: mod.ranges[0].max } : undefined
    return mod.lines
      .map(displayText)
      .filter(Boolean)
      .map(
        (text): ModLine => ({
          text,
          ...(mod.fractured ? { fractured: true as const } : {}),
          ...(mod.crafted ? { crafted: true as const } : {}),
          ...(mod.tier > 0
            ? { tier: { affix, num: mod.tier, label: `${affix === 'prefix' ? 'P' : 'S'}${mod.tier}` } }
            : {}),
          ...(range ? { range } : {}),
        }),
      )
  })
}

/** Advanced copies file implicits under "{ Implicit Modifier }" headers; plain copies tag the line. */
function implicitLines(item: PoeItem): ModLine[] {
  if (item.implicits.length > 0) return plainLines(item.implicits)
  return plainLines((item.advancedMods ?? []).filter((m) => m.type === 'implicit').flatMap((m) => m.lines))
}

function sections(item: PoeItem): ModSection[] {
  const out: ModSection[] = []
  const push = (kind: ModSection['kind'], lines: ModLine[]): void => {
    if (lines.length > 0) out.push({ kind, lines: lines.slice(0, LIMITS.linesPerSection) })
  }
  push('enchant', plainLines(item.enchants))
  push('rune', plainLines(item.runes))
  push('implicit', implicitLines(item))
  push('granted-skill', plainLines(item.grantedSkills))
  push('explicit', explicitLines(item))
  return out
}

function properties(item: PoeItem): SnapshotItem['properties'] {
  const props: SnapshotItem['properties'] = []
  if (item.quality > 0) props.push({ name: 'Quality', value: `+${item.quality}%` })
  if (item.physDamageMin && item.physDamageMax) {
    props.push({ name: 'Physical Damage', value: `${item.physDamageMin}-${item.physDamageMax}` })
  }
  if (item.critChance) props.push({ name: 'Critical Hit Chance', value: `${item.critChance.toFixed(2)}%` })
  if (item.attacksPerSecond) props.push({ name: 'Attacks per Second', value: item.attacksPerSecond.toFixed(2) })
  if (item.armour > 0) props.push({ name: 'Armour', value: String(item.armour) })
  if (item.evasion > 0) props.push({ name: 'Evasion Rating', value: String(item.evasion) })
  if (item.energyShield > 0) props.push({ name: 'Energy Shield', value: String(item.energyShield) })
  return props
}

function requirements(item: PoeItem): SnapshotItem['requirements'] {
  const reqs: SnapshotItem['requirements'] = []
  if (item.requiredLevel) reqs.push({ name: 'Level', value: String(item.requiredLevel) })
  if (item.reqStr > 0) reqs.push({ name: 'Str', value: String(item.reqStr) })
  if (item.reqDex > 0) reqs.push({ name: 'Dex', value: String(item.reqDex) })
  if (item.reqInt > 0) reqs.push({ name: 'Int', value: String(item.reqInt) })
  return reqs
}

export interface ClipboardItemDeps {
  /** Item art by unique name or base type. */
  iconFor: (name: string, baseType: string) => string | undefined
  price: (item: SnapshotItem) => SnapshotItem['price']
  /** Precomputed viewer price check for the copied item; null when it can't be price-checked. */
  priceCheck?: (item: PoeItem) => PriceCheck | null
}

/** Build a snapshot item from a clipboard-parsed item, or null when it has no item art to show. */
export function snapshotItemFromClipboard(item: PoeItem, deps: ClipboardItemDeps): SnapshotItem | null {
  const icon = deps.iconFor(item.name, item.baseType)
  if (!icon || !icon.startsWith(POECDN_PREFIX)) return null
  const rarity = RARITY[item.rarity] ?? 'normal'
  const flags: SnapshotItem['flags'] = {}
  if (item.corrupted) flags.corrupted = true
  if (item.twiceCorrupted) flags.doubleCorrupted = true
  if (item.fractured) flags.fractured = true
  if (item.sanctified) flags.sanctified = true
  if (item.mirrored) flags.mirrored = true
  if (!item.identified) flags.unidentified = true

  const snapshotItem: SnapshotItem = {
    name: item.name && item.name !== item.baseType ? clip(item.name) : null,
    baseType: clip(item.baseType),
    rarity,
    icon,
    w: Math.min(4, Math.max(1, item.width ?? 1)),
    h: Math.min(4, Math.max(1, item.height ?? 1)),
    ilvl: item.itemLevel > 0 ? Math.min(100, item.itemLevel) : null,
    flags,
    properties: properties(item),
    requirements: requirements(item),
    sections: sections(item),
    // Clipboard runes carry no card: the clipboard has no socketed-item data.
    sockets: [],
    price: null,
  }
  snapshotItem.price = rarity === 'unique' ? deps.price(snapshotItem) : null
  if (deps.priceCheck) {
    const pc = deps.priceCheck(item)
    if (pc) snapshotItem.priceCheck = pc
  }
  return snapshotItem
}
