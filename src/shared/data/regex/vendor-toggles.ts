export interface VendorSettings {
  itemProperty: { quality: boolean; sockets: boolean }
  itemType: { rare: boolean; magic: boolean; normal: boolean }
  resistances: { fire: boolean; cold: boolean; lightning: boolean; chaos: boolean }
  movementSpeed: { move30: boolean; move25: boolean; move20: boolean; move15: boolean; move10: boolean }
  itemMods: {
    physical: boolean
    spellDamage: boolean
    elemental: boolean
    coldDamage: boolean
    fireDamage: boolean
    lightningDamage: boolean
    chaosDamage: boolean
    spirit: boolean
    rarity: boolean
    maxLife: boolean
    maxMana: boolean
    attackSpeed: boolean
    castSpeed: boolean
    skillLevel: boolean
    skillLevelMinion: boolean
    skillLevelMelee: boolean
    skillLevelSpell: boolean
    skillLevelFire: boolean
    skillLevelCold: boolean
    skillLevelLightning: boolean
    skillLevelPhysical: boolean
    skillLevelProjectile: boolean
    strength: boolean
    intelligence: boolean
    dexterity: boolean
  }
  itemClass: {
    amulets: boolean
    rings: boolean
    belts: boolean
    daggers: boolean
    wands: boolean
    oneHandMaces: boolean
    sceptres: boolean
    bows: boolean
    staves: boolean
    twoHandMaces: boolean
    quarterstaves: boolean
    spears: boolean
    crossbows: boolean
    talisman: boolean
    gloves: boolean
    boots: boolean
    bodyArmours: boolean
    helmets: boolean
    quivers: boolean
    foci: boolean
    shields: boolean
  }
  itemLevel: { min: number; max: number }
  characterLevel: { min: number; max: number }
}

type BooleanGroup = 'itemProperty' | 'itemType' | 'resistances' | 'movementSpeed' | 'itemMods' | 'itemClass'

export interface VendorToggle {
  group: BooleanGroup
  field: string
  label: string
}
export interface VendorSection {
  label: string
  toggles: VendorToggle[]
}
export type VendorTabKey = 'mods' | 'item' | 'class'
export interface VendorTab {
  key: VendorTabKey
  label: string
  sections: VendorSection[]
}

export const DEFAULT_VENDOR_SETTINGS: VendorSettings = {
  itemProperty: { quality: false, sockets: false },
  itemType: { rare: false, magic: false, normal: false },
  resistances: { fire: false, cold: false, lightning: false, chaos: false },
  movementSpeed: { move30: false, move25: false, move20: false, move15: false, move10: false },
  itemMods: {
    physical: false,
    spellDamage: false,
    elemental: false,
    coldDamage: false,
    fireDamage: false,
    lightningDamage: false,
    chaosDamage: false,
    spirit: false,
    rarity: false,
    maxLife: false,
    maxMana: false,
    attackSpeed: false,
    castSpeed: false,
    skillLevel: false,
    skillLevelMinion: false,
    skillLevelMelee: false,
    skillLevelSpell: false,
    skillLevelFire: false,
    skillLevelCold: false,
    skillLevelLightning: false,
    skillLevelPhysical: false,
    skillLevelProjectile: false,
    strength: false,
    intelligence: false,
    dexterity: false,
  },
  itemClass: {
    amulets: false,
    rings: false,
    belts: false,
    daggers: false,
    wands: false,
    oneHandMaces: false,
    sceptres: false,
    bows: false,
    staves: false,
    twoHandMaces: false,
    quarterstaves: false,
    spears: false,
    crossbows: false,
    talisman: false,
    gloves: false,
    boots: false,
    bodyArmours: false,
    helmets: false,
    quivers: false,
    foci: false,
    shields: false,
  },
  itemLevel: { min: 0, max: 0 },
  characterLevel: { min: 0, max: 0 },
}

export const VENDOR_TABS: VendorTab[] = [
  {
    key: 'mods',
    label: 'Mods',
    sections: [
      {
        label: 'Damage',
        toggles: [
          { group: 'itemMods', field: 'physical', label: 'Physical damage' },
          { group: 'itemMods', field: 'spellDamage', label: 'Spell damage' },
          { group: 'itemMods', field: 'elemental', label: 'Elemental damage' },
          { group: 'itemMods', field: 'coldDamage', label: 'Cold damage' },
          { group: 'itemMods', field: 'fireDamage', label: 'Fire damage' },
          { group: 'itemMods', field: 'lightningDamage', label: 'Lightning damage' },
          { group: 'itemMods', field: 'chaosDamage', label: 'Chaos damage' },
        ],
      },
      {
        label: 'Defences & Utility',
        toggles: [
          { group: 'itemMods', field: 'maxLife', label: 'Maximum Life' },
          { group: 'itemMods', field: 'maxMana', label: 'Maximum Mana' },
          { group: 'itemMods', field: 'spirit', label: '+# Spirit' },
          { group: 'itemMods', field: 'rarity', label: 'Increased Rarity' },
        ],
      },
      {
        label: 'Skill levels',
        toggles: [
          { group: 'itemMods', field: 'skillLevel', label: '+# to level of skills' },
          { group: 'itemMods', field: 'skillLevelMinion', label: '+# to level of minion skills' },
          { group: 'itemMods', field: 'skillLevelMelee', label: '+# to level of melee skills' },
          { group: 'itemMods', field: 'skillLevelSpell', label: '+# to level of all spell skills' },
          { group: 'itemMods', field: 'skillLevelFire', label: '+# to level of fire spell skills' },
          { group: 'itemMods', field: 'skillLevelCold', label: '+# to level of cold spell skills' },
          { group: 'itemMods', field: 'skillLevelLightning', label: '+# to level of lightning spell skills' },
          { group: 'itemMods', field: 'skillLevelPhysical', label: '+# to level of physical spell skills' },
          { group: 'itemMods', field: 'skillLevelProjectile', label: '+# to level of projectile skills' },
        ],
      },
      {
        label: 'Speed',
        toggles: [
          { group: 'itemMods', field: 'attackSpeed', label: 'Attack speed' },
          { group: 'itemMods', field: 'castSpeed', label: 'Cast speed' },
        ],
      },
      {
        label: 'Movement speed',
        toggles: [
          { group: 'movementSpeed', field: 'move30', label: 'Movement speed (30%)' },
          { group: 'movementSpeed', field: 'move25', label: 'Movement speed (25%)' },
          { group: 'movementSpeed', field: 'move20', label: 'Movement speed (20%)' },
          { group: 'movementSpeed', field: 'move15', label: 'Movement speed (15%)' },
          { group: 'movementSpeed', field: 'move10', label: 'Movement speed (10%)' },
        ],
      },
      {
        label: 'Attributes',
        toggles: [
          { group: 'itemMods', field: 'strength', label: 'Strength' },
          { group: 'itemMods', field: 'dexterity', label: 'Dexterity' },
          { group: 'itemMods', field: 'intelligence', label: 'Intelligence' },
        ],
      },
      {
        label: 'Resistances',
        toggles: [
          { group: 'resistances', field: 'fire', label: 'Fire resistance' },
          { group: 'resistances', field: 'cold', label: 'Cold resistance' },
          { group: 'resistances', field: 'lightning', label: 'Lightning resistance' },
          { group: 'resistances', field: 'chaos', label: 'Chaos resistance' },
        ],
      },
    ],
  },
  {
    key: 'item',
    label: 'Item',
    sections: [
      {
        label: 'Item property',
        toggles: [
          { group: 'itemProperty', field: 'quality', label: 'Quality' },
          { group: 'itemProperty', field: 'sockets', label: 'Sockets' },
        ],
      },
      {
        label: 'Item rarity',
        toggles: [
          { group: 'itemType', field: 'rare', label: 'Rare' },
          { group: 'itemType', field: 'magic', label: 'Magic' },
          { group: 'itemType', field: 'normal', label: 'Normal' },
        ],
      },
      // Item level + Character level ranges are rendered separately by the component
      // (numeric inputs), not as toggles.
    ],
  },
  {
    key: 'class',
    label: 'Class',
    sections: [
      {
        label: 'Jewellery',
        toggles: [
          { group: 'itemClass', field: 'amulets', label: 'Amulets' },
          { group: 'itemClass', field: 'rings', label: 'Rings' },
          { group: 'itemClass', field: 'belts', label: 'Belts' },
        ],
      },
      {
        label: '1H weapons',
        toggles: [
          { group: 'itemClass', field: 'wands', label: 'Wands' },
          { group: 'itemClass', field: 'oneHandMaces', label: 'One Hand Maces' },
          { group: 'itemClass', field: 'sceptres', label: 'Sceptres' },
        ],
      },
      {
        label: '2H weapons',
        toggles: [
          { group: 'itemClass', field: 'bows', label: 'Bows' },
          { group: 'itemClass', field: 'staves', label: 'Staves' },
          { group: 'itemClass', field: 'twoHandMaces', label: 'Two Hand Maces' },
          { group: 'itemClass', field: 'quarterstaves', label: 'Quarterstaves' },
          { group: 'itemClass', field: 'spears', label: 'Spears' },
          { group: 'itemClass', field: 'crossbows', label: 'Crossbows' },
          { group: 'itemClass', field: 'talisman', label: 'Talisman' },
        ],
      },
      {
        label: 'Equipment',
        toggles: [
          { group: 'itemClass', field: 'gloves', label: 'Gloves' },
          { group: 'itemClass', field: 'boots', label: 'Boots' },
          { group: 'itemClass', field: 'bodyArmours', label: 'Body Armours' },
          { group: 'itemClass', field: 'helmets', label: 'Helmets' },
        ],
      },
      {
        label: 'Offhand',
        toggles: [
          { group: 'itemClass', field: 'quivers', label: 'Quivers' },
          { group: 'itemClass', field: 'foci', label: 'Foci' },
          { group: 'itemClass', field: 'shields', label: 'Shields' },
        ],
      },
    ],
  },
]

const BOOLEAN_GROUPS: BooleanGroup[] = [
  'itemProperty',
  'itemType',
  'resistances',
  'movementSpeed',
  'itemMods',
  'itemClass',
]

/** Flatten a VendorSettings into the RegexPreset.qualifiers map: booleans as 0/1
 *  keyed `<group>.<field>`, level ranges as four explicit numeric keys. */
export function vendorSettingsToQualifiers(s: VendorSettings): Record<string, number> {
  const q: Record<string, number> = {}
  for (const group of BOOLEAN_GROUPS) {
    const obj = s[group] as Record<string, boolean>
    for (const field of Object.keys(obj)) q[`${group}.${field}`] = obj[field] ? 1 : 0
  }
  q['itemLevel.min'] = s.itemLevel.min
  q['itemLevel.max'] = s.itemLevel.max
  q['characterLevel.min'] = s.characterLevel.min
  q['characterLevel.max'] = s.characterLevel.max
  return q
}

/** Inverse of vendorSettingsToQualifiers. Starts from defaults so missing keys
 *  fall back to false/0 (forward-compatible if the catalog gains toggles). */
export function qualifiersToVendorSettings(q: Record<string, number>): VendorSettings {
  const s = structuredClone(DEFAULT_VENDOR_SETTINGS)
  for (const group of BOOLEAN_GROUPS) {
    const obj = s[group] as Record<string, boolean>
    for (const field of Object.keys(obj)) obj[field] = (q[`${group}.${field}`] ?? 0) === 1
  }
  s.itemLevel = { min: q['itemLevel.min'] ?? 0, max: q['itemLevel.max'] ?? 0 }
  s.characterLevel = { min: q['characterLevel.min'] ?? 0, max: q['characterLevel.max'] ?? 0 }
  return s
}

export interface VendorGroupsState {
  groups: VendorSettings[]
  selectedGroupId: number
}

export const DEFAULT_VENDOR_GROUPS_STATE: VendorGroupsState = {
  groups: [structuredClone(DEFAULT_VENDOR_SETTINGS)],
  selectedGroupId: 0,
}

/** Count active conditions in a group: every checked toggle across all tabs plus
 *  one for each non-zero level range. Drives the group-pill count badge and the
 *  "empty" gate. */
export function vendorGroupConditionCount(group: VendorSettings): number {
  let n = 0
  for (const tab of VENDOR_TABS) {
    for (const section of tab.sections) {
      for (const tg of section.toggles) {
        if ((group[tg.group] as Record<string, boolean>)[tg.field]) n++
      }
    }
  }
  if (group.itemLevel.min !== 0 || group.itemLevel.max !== 0) n++
  if (group.characterLevel.min !== 0 || group.characterLevel.max !== 0) n++
  return n
}

/** True when the state is a single group with nothing selected. Keeps the grouping
 *  UI hidden until the user ticks their first condition. */
export function isVendorGroupsEmpty(state: VendorGroupsState): boolean {
  return state.groups.length === 1 && vendorGroupConditionCount(state.groups[0]) === 0
}

/** Flatten a grouped state into RegexPreset.qualifiers: a `groupCount` plus each
 *  group's per-field keys prefixed `g${i}.`. selectedGroupId is ephemeral and not
 *  serialized. */
export function vendorGroupsToQualifiers(state: VendorGroupsState): Record<string, number> {
  const q: Record<string, number> = { groupCount: state.groups.length }
  state.groups.forEach((group, i) => {
    const sub = vendorSettingsToQualifiers(group)
    for (const k of Object.keys(sub)) q[`g${i}.${k}`] = sub[k]
  })
  return q
}

/** Inverse of vendorGroupsToQualifiers. Back-compat: a qualifiers map with no
 *  `groupCount` (old single-group vendor presets) is read as one legacy group.
 *  Always returns selectedGroupId 0. */
export function qualifiersToVendorGroups(q: Record<string, number>): VendorGroupsState {
  const count = q.groupCount
  if (!count || count < 1) {
    return { groups: [qualifiersToVendorSettings(q)], selectedGroupId: 0 }
  }
  const groups: VendorSettings[] = []
  for (let i = 0; i < count; i++) {
    const prefix = `g${i}.`
    const sub: Record<string, number> = {}
    for (const k of Object.keys(q)) {
      if (k.startsWith(prefix)) sub[k.slice(prefix.length)] = q[k]
    }
    groups.push(qualifiersToVendorSettings(sub))
  }
  return { groups, selectedGroupId: 0 }
}

/** One-time localStorage migration: if the new grouped key is absent but the legacy
 *  single-settings key exists, wrap the legacy value as one group. Idempotent via the
 *  groups-key presence check (no module flag, so it stays unit-testable). Malformed
 *  legacy JSON is ignored, falling through to the caller's default. */
export function ensureVendorGroupsMigrated(legacyKey: string, groupsKey: string): void {
  try {
    if (localStorage.getItem(groupsKey) != null) return
    const legacy = localStorage.getItem(legacyKey)
    if (legacy == null) return
    const parsed = JSON.parse(legacy) as VendorSettings
    const state: VendorGroupsState = { groups: [parsed], selectedGroupId: 0 }
    localStorage.setItem(groupsKey, JSON.stringify(state))
  } catch {
    // ignore malformed legacy data
  }
}

/** PoE2 mirror of sanitizeVendorPoe1Groups: coerce an untrusted persisted value
 *  into a valid groups state (heals a poe2: key poisoned with PoE1-shaped state
 *  by the pre-fix in-process game switch). */
export function sanitizeVendorGroups(value: unknown): VendorGroupsState {
  if (typeof value !== 'object' || value === null) return structuredClone(DEFAULT_VENDOR_GROUPS_STATE)
  const raw = value as { groups?: unknown; selectedGroupId?: unknown }
  if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
    return structuredClone(DEFAULT_VENDOR_GROUPS_STATE)
  }
  const groups = raw.groups.map((g) => sanitizeVendorSettings(g))
  const sel = typeof raw.selectedGroupId === 'number' && Number.isFinite(raw.selectedGroupId) ? raw.selectedGroupId : 0
  return { groups, selectedGroupId: Math.min(Math.max(0, sel), groups.length - 1) }
}

function sanitizeVendorSettings(value: unknown): VendorSettings {
  const s = structuredClone(DEFAULT_VENDOR_SETTINGS)
  if (typeof value !== 'object' || value === null) return s
  const raw = value as Record<string, unknown>
  for (const group of BOOLEAN_GROUPS) {
    const src = raw[group]
    if (typeof src !== 'object' || src === null) continue
    const dst = s[group] as Record<string, boolean>
    for (const field of Object.keys(dst)) {
      const v = (src as Record<string, unknown>)[field]
      if (typeof v === 'boolean') dst[field] = v
    }
  }
  s.itemLevel = sanitizeLevelRange(raw.itemLevel)
  s.characterLevel = sanitizeLevelRange(raw.characterLevel)
  return s
}

function sanitizeLevelRange(value: unknown): { min: number; max: number } {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0)
  return { min: num(raw.min), max: num(raw.max) }
}
