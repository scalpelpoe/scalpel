import {
  LIMITS,
  type ModLine,
  type ModSection,
  NINJA_ASSETS_PREFIX,
  POECDN_PREFIX,
  SLOTS,
  type Slot,
  type SnapshotItem,
  type SnapshotSkill,
  type Socket,
  type StreamSnapshot,
} from '@scalpel/stream-contract'
import { stripTradeTokens } from '@shared/game-text'
import { type NinjaCharacter, type NinjaItemData, NinjaItemDataSchema, type NinjaProperty } from './sources/ninja-types'
import { clip } from './text'

export interface NormalizeOptions {
  now: Date
  hideCharacterName: boolean
}

export interface NormalizedCharacter {
  snapshot: StreamSnapshot
  /** The source item behind each snapshot item, kept for enrichment (tiers, prices). */
  sourceOf: Map<SnapshotItem, NinjaItemData>
  /** Items or fields that were dropped, for the Streaming tab's status line. */
  warnings: string[]
}

const SLOT_SET = new Set<string>(SLOTS)

/** GGG frameType -> contract rarity. 9 is PoE1's relic frame; treat as unique. */
const RARITY_BY_FRAME: Record<number, SnapshotItem['rarity']> = {
  0: 'normal',
  1: 'magic',
  2: 'rare',
  3: 'unique',
  4: 'gem',
  5: 'currency',
  9: 'unique',
}

/** PoE2 flask belt: positions 0-1 hold flasks, 2+ hold charms. */
const FIRST_CHARM_X = 2

function clean(s: string): string {
  return clip(stripTradeTokens(s).trim())
}

/** poe.ninja serves passive tree art relative to this. */
const NINJA_TREE_ART = `${NINJA_ASSETS_PREFIX}poe2/tree/`

/** Only plain relative paths ("passives/x.webp"), so the URL stays on poe.ninja's tree art. */
function treeArt(path: string | null | undefined): string | null {
  if (!path || !/^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.(webp|png)$/i.test(path)) return null
  const url = NINJA_TREE_ART + path
  return url.length <= LIMITS.string ? url : null
}

function isCdnUrl(url: string | undefined): url is string {
  return !!url && url.startsWith(POECDN_PREFIX) && url.length <= LIMITS.string
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)))
}

function nonNull<T>(v: T | null | undefined): v is T {
  return v != null
}

function toIsoUtc(s: string, fallback: Date): string {
  const t = Date.parse(s)
  return new Date(Number.isFinite(t) ? t : fallback.getTime()).toISOString()
}

/** GGG property line -> display name/value. displayMode 3 lines are templates
 *  ("Recovers {0} Life over {1} Seconds") filled from the values in order. */
function formatProperty(p: NinjaProperty): { name: string; value: string | null } | null {
  const values = p.values.map(([v]) => clean(String(v))).filter(Boolean)
  const name = clean(p.name)
  if (p.displayMode === 3) {
    const text = name.replace(/\{(\d+)\}/g, (_, i: string) => values[Number(i)] ?? '')
    return text ? { name: text, value: null } : null
  }
  if (!name && values.length === 0) return null
  return { name, value: values.length > 0 ? values.join(', ') : null }
}

function modLines(texts: string[], extra: Omit<ModLine, 'text'> = {}): ModLine[] {
  return texts
    .map(clean)
    .filter(Boolean)
    .map((text) => ({ text, ...extra }))
}

/** Sections in in-game tooltip order. Fractured lines lead the explicit block,
 *  crafted ones close it, matching Scalpel's own item cards. */
function buildSections(raw: NinjaItemData): ModSection[] {
  const sections: ModSection[] = []
  const push = (kind: ModSection['kind'], lines: ModLine[]): void => {
    if (lines.length > 0) sections.push({ kind, lines: lines.slice(0, LIMITS.linesPerSection) })
  }
  push('enchant', modLines(raw.enchantMods))
  push('rune', modLines(raw.runeMods))
  push('implicit', modLines(raw.implicitMods))
  push(
    'granted-skill',
    raw.grantedSkills
      .map(formatProperty)
      .filter(nonNull)
      .map((p) => ({ text: clip(p.value ? `${p.name}: ${p.value}` : p.name) })),
  )
  push('explicit', [
    ...modLines(raw.fracturedMods, { fractured: true }),
    ...modLines(raw.explicitMods),
    ...modLines(raw.mutatedMods),
    ...modLines(raw.craftedMods, { crafted: true }),
  ])
  push('desecrated', modLines(raw.desecratedMods))
  push('bonded', modLines(raw.bondedMods))
  return sections.slice(0, LIMITS.sections)
}

function parseChildren(raw: NinjaItemData): NinjaItemData[] {
  return raw.socketedItems.map((c) => NinjaItemDataSchema.safeParse(c)).flatMap((r) => (r.success ? [r.data] : []))
}

function buildSockets(raw: NinjaItemData): Socket[] {
  const children = parseChildren(raw)
  return raw.sockets.slice(0, LIMITS.sockets).map((s, i) => {
    const child = children.find((c) => c.socket === i)
    const kind: Socket['kind'] = s.type === 'rune' || s.type === 'gem' || s.type === 'jewel' ? s.type : 'other'
    return {
      kind,
      name: child ? clean(child.typeLine) || null : null,
      icon: child && isCdnUrl(child.icon) ? child.icon : null,
    }
  })
}

export function normalizeItem(
  input: unknown,
  warnings: string[],
  where: string,
): { item: SnapshotItem; raw: NinjaItemData } | null {
  const parsed = NinjaItemDataSchema.safeParse(input)
  if (!parsed.success) {
    warnings.push(`${where}: unreadable item`)
    return null
  }
  const raw = parsed.data
  if (!isCdnUrl(raw.icon)) {
    warnings.push(`${where}: ${raw.typeLine} has no item art`)
    return null
  }

  const rarity = RARITY_BY_FRAME[raw.frameType ?? 0] ?? 'normal'
  const typeLine = clean(raw.typeLine)
  const baseType = clean(raw.baseType || raw.typeLine)
  const name =
    rarity === 'rare' || rarity === 'unique' ? clean(raw.name) || null : typeLine !== baseType ? typeLine : null

  const flags: SnapshotItem['flags'] = {}
  if (raw.corrupted) flags.corrupted = true
  if (raw.doubleCorrupted) flags.doubleCorrupted = true
  if (raw.fractured) flags.fractured = true
  if (raw.desecrated) flags.desecrated = true
  if (raw.sanctified) flags.sanctified = true
  if (raw.duplicated) flags.mirrored = true
  if (raw.identified === false) flags.unidentified = true

  const item: SnapshotItem = {
    name,
    baseType,
    rarity,
    icon: raw.icon,
    w: clampInt(raw.w, 1, 4),
    h: clampInt(raw.h, 1, 4),
    ilvl: raw.ilvl ? clampInt(raw.ilvl, 0, 100) : null,
    flags,
    properties: raw.properties.map(formatProperty).filter(nonNull).slice(0, LIMITS.properties),
    requirements: raw.requirements
      .map(formatProperty)
      .filter(nonNull)
      .map((p) => ({ name: p.name, value: p.value ?? '' }))
      .slice(0, LIMITS.requirements),
    sections: buildSections(raw),
    sockets: buildSockets(raw),
    price: null,
  }
  return { item, raw }
}

function propertyNumber(item: NinjaItemData, name: string, max: number): number | null {
  const prop = item.properties.find((p) => clean(p.name) === name)
  const text = prop?.values[0]?.[0]
  const n = text == null ? Number.NaN : Number.parseInt(String(text).replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

function buildSkill(entry: NinjaCharacter['skills'][number]): SnapshotSkill | null {
  const gems = entry.allGems
    .map((g) => NinjaItemDataSchema.safeParse(g.itemData))
    .flatMap((r) => (r.success ? [r.data] : []))
  const main = gems.find((g) => !g.support)
  if (!main) return null
  const supports = parseChildren(main)
    .filter((s) => s.support)
    .map((s) => ({ name: clean(s.typeLine), icon: isCdnUrl(s.icon) ? s.icon : null }))
    .filter((s) => s.name)
    .slice(0, LIMITS.supportsPerSkill)
  return {
    gem: {
      name: clean(main.typeLine),
      icon: isCdnUrl(main.icon) ? main.icon : null,
      level: propertyNumber(main, 'Level', 40),
      quality: propertyNumber(main, 'Quality', 40),
    },
    supports,
  }
}

/** Build the display-ready snapshot from a poe.ninja character. Tiers and prices
 *  are layered on afterwards by enrich.ts. */
export function normalizeCharacter(raw: NinjaCharacter, opts: NormalizeOptions): NormalizedCharacter {
  const warnings: string[] = []
  const sourceOf = new Map<SnapshotItem, NinjaItemData>()
  const take = (entry: { itemData: unknown }, where: string): { item: SnapshotItem; raw: NinjaItemData } | null => {
    const result = normalizeItem(entry.itemData, warnings, where)
    if (result) sourceOf.set(result.item, result.raw)
    return result
  }

  const equipment: Partial<Record<Slot, SnapshotItem>> = {}
  const other: SnapshotItem[] = []
  for (const entry of raw.items) {
    const result = take(entry, 'equipment')
    if (!result) continue
    const slot = result.raw.inventoryId
    if (slot && SLOT_SET.has(slot) && !equipment[slot as Slot]) equipment[slot as Slot] = result.item
    else other.push(result.item)
  }

  const belt = raw.flasks
    .map((e) => take(e, 'flasks'))
    .filter(nonNull)
    .sort((a, b) => (a.raw.x ?? 0) - (b.raw.x ?? 0))
  const flasks = belt.filter((r) => (r.raw.x ?? 0) < FIRST_CHARM_X).map((r) => r.item)
  const charms = belt.filter((r) => (r.raw.x ?? 0) >= FIRST_CHARM_X).map((r) => r.item)
  other.push(...flasks.splice(LIMITS.flasks), ...charms.splice(LIMITS.charms))

  const jewels = raw.jewels
    .map((e) => take(e, 'jewels'))
    .filter(nonNull)
    .map((r) => r.item)

  // Stay inside the contract's total-item cap by trimming the least visible groups first.
  const equippedCount = Object.keys(equipment).length + flasks.length + charms.length
  const room = Math.max(0, LIMITS.items - equippedCount)
  if (jewels.length + other.length > room) {
    warnings.push(`dropped ${jewels.length + other.length - room} items over the ${LIMITS.items}-item limit`)
    jewels.splice(room)
    other.splice(Math.max(0, room - jewels.length))
  }

  const pob =
    raw.pathOfBuildingExport && raw.pathOfBuildingExport.length <= LIMITS.pob ? raw.pathOfBuildingExport : null

  const snapshot: StreamSnapshot = {
    schema: 1,
    game: 'poe2',
    character: {
      name: opts.hideCharacterName ? null : clip(raw.name),
      class: clip(raw.class),
      level: clampInt(raw.level, 1, 100),
      league: clip(raw.league),
      activeWeaponSet: raw.useSecondWeaponSet ? 2 : 1,
    },
    source: { kind: 'poe.ninja', updatedUtc: toIsoUtc(raw.updatedUtc, opts.now) },
    publishedUtc: opts.now.toISOString(),
    equipment,
    flasks,
    charms,
    jewels,
    other,
    skills: raw.skills.map(buildSkill).filter(nonNull).slice(0, LIMITS.skills),
    keystones: raw.keystones
      .map((k) => ({
        name: clean(k.name),
        icon: treeArt(k.icon),
        stats: k.stats.map(clean).filter(Boolean).slice(0, LIMITS.keystoneStats),
      }))
      .filter((k) => k.name)
      .slice(0, LIMITS.keystones),
    pob,
    patches: [],
  }
  return { snapshot, sourceOf, warnings }
}
