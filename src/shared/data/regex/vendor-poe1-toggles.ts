/** PoE1 vendor-regex toggle catalog + preset-qualifier round-trip. Mirrors the
 *  PoE2 catalog in vendor-toggles.ts; the settings shape maps 1:1 onto poe.re's
 *  PoeStringSettings (minus the dropped "Other Links" specLink feature) so the
 *  engine port stays a mechanical translation. */

export interface VendorPoe1Settings {
  links: { any3: boolean; any4: boolean; any5: boolean; any6: boolean; socket6: boolean }
  colors3: {
    rrr: boolean
    ggg: boolean
    bbb: boolean
    rrA: boolean
    ggA: boolean
    bbA: boolean
    rrg: boolean
    rrb: boolean
    ggr: boolean
    ggb: boolean
    bbr: boolean
    bbg: boolean
    rgb: boolean
    raa: boolean
    gaa: boolean
    baa: boolean
  }
  colors2: { rr: boolean; gg: boolean; bb: boolean; rb: boolean; gr: boolean; bg: boolean }
  movement: { ten: boolean; fifteen: boolean }
  plusGems: { any: boolean; lightning: boolean; fire: boolean; cold: boolean; phys: boolean; chaos: boolean }
  damage: { phys: boolean; firemult: boolean; coldmult: boolean; chaosmult: boolean }
  weapon: {
    sceptre: boolean
    mace: boolean
    axe: boolean
    sword: boolean
    bow: boolean
    claw: boolean
    dagger: boolean
    staff: boolean
    wand: boolean
    shield: boolean
  }
  /** Selected gem token ids (from the synced gems dataset). Selection order is
   *  preserved through the qualifier round-trip because the prefixed keys are
   *  non-integer strings (insertion order is retained by JS objects). */
  gems: number[]
}

export type VendorPoe1BooleanGroup = 'links' | 'colors3' | 'colors2' | 'movement' | 'plusGems' | 'damage' | 'weapon'

export interface VendorPoe1Toggle {
  group: VendorPoe1BooleanGroup
  field: string
  label: string
  /** Socket-chain pattern rendered as socket art by the component (e.g. "r-r-*";
   *  "*" is the 3.29 colorless socket). Absent for plain text rows. */
  sockets?: string
}
export interface VendorPoe1Section {
  label: string
  /** Dim one-line note rendered under the section header. */
  caption?: string
  toggles: VendorPoe1Toggle[]
}
export type VendorPoe1TabKey = 'links' | 'item' | 'gems'
export interface VendorPoe1Tab {
  key: VendorPoe1TabKey
  label: string
  sections: VendorPoe1Section[]
}

export const DEFAULT_VENDOR_POE1_SETTINGS: VendorPoe1Settings = {
  links: { any3: false, any4: false, any5: false, any6: false, socket6: false },
  colors3: {
    rrr: false,
    ggg: false,
    bbb: false,
    rrA: false,
    ggA: false,
    bbA: false,
    rrg: false,
    rrb: false,
    ggr: false,
    ggb: false,
    bbr: false,
    bbg: false,
    rgb: false,
    raa: false,
    gaa: false,
    baa: false,
  },
  colors2: { rr: false, gg: false, bb: false, rb: false, gr: false, bg: false },
  movement: { ten: false, fifteen: false },
  plusGems: { any: false, lightning: false, fire: false, cold: false, phys: false, chaos: false },
  damage: { phys: false, firemult: false, coldmult: false, chaosmult: false },
  weapon: {
    sceptre: false,
    mace: false,
    axe: false,
    sword: false,
    bow: false,
    claw: false,
    dagger: false,
    staff: false,
    wand: false,
    shield: false,
  },
  gems: [],
}

/** Row order inside sections follows poe.re's Vendor page column order. The gems
 *  tab has no toggle sections; the component renders the gem list itself. */
export const VENDOR_POE1_TABS: VendorPoe1Tab[] = [
  {
    key: 'links',
    label: 'Links',
    sections: [
      {
        label: 'Any links',
        toggles: [
          { group: 'links', field: 'any3', label: 'Any 3-link', sockets: '*-*-*' },
          { group: 'links', field: 'any4', label: 'Any 4-link', sockets: '*-*-*-*' },
          { group: 'links', field: 'any5', label: 'Any 5-link', sockets: '*-*-*-*-*' },
          { group: 'links', field: 'any6', label: 'Any 6 link' },
          { group: 'links', field: 'socket6', label: 'Any 6 socket' },
        ],
      },
      {
        label: 'Link colors (3L)',
        toggles: [
          { group: 'colors3', field: 'rrA', label: 'r-r-*', sockets: 'r-r-*' },
          { group: 'colors3', field: 'ggA', label: 'g-g-*', sockets: 'g-g-*' },
          { group: 'colors3', field: 'bbA', label: 'b-b-*', sockets: 'b-b-*' },
          { group: 'colors3', field: 'rrr', label: 'r-r-r', sockets: 'r-r-r' },
          { group: 'colors3', field: 'rrg', label: 'r-r-g', sockets: 'r-r-g' },
          { group: 'colors3', field: 'rrb', label: 'r-r-b', sockets: 'r-r-b' },
          { group: 'colors3', field: 'ggg', label: 'g-g-g', sockets: 'g-g-g' },
          { group: 'colors3', field: 'ggr', label: 'g-g-r', sockets: 'g-g-r' },
          { group: 'colors3', field: 'ggb', label: 'g-g-b', sockets: 'g-g-b' },
          { group: 'colors3', field: 'bbb', label: 'b-b-b', sockets: 'b-b-b' },
          { group: 'colors3', field: 'bbr', label: 'b-b-r', sockets: 'b-b-r' },
          { group: 'colors3', field: 'bbg', label: 'b-b-g', sockets: 'b-b-g' },
          { group: 'colors3', field: 'rgb', label: 'r-g-b', sockets: 'r-g-b' },
          { group: 'colors3', field: 'raa', label: 'r-*-*', sockets: 'r-*-*' },
          { group: 'colors3', field: 'gaa', label: 'g-*-*', sockets: 'g-*-*' },
          { group: 'colors3', field: 'baa', label: 'b-*-*', sockets: 'b-*-*' },
        ],
      },
      {
        label: 'Link colors (2L)',
        toggles: [
          { group: 'colors2', field: 'rr', label: 'r-r', sockets: 'r-r' },
          { group: 'colors2', field: 'gg', label: 'g-g', sockets: 'g-g' },
          { group: 'colors2', field: 'bb', label: 'b-b', sockets: 'b-b' },
          { group: 'colors2', field: 'rb', label: 'r-b', sockets: 'r-b' },
          { group: 'colors2', field: 'gr', label: 'g-r', sockets: 'g-r' },
          { group: 'colors2', field: 'bg', label: 'b-g', sockets: 'b-g' },
        ],
      },
    ],
  },
  {
    key: 'item',
    label: 'Item/Mods',
    sections: [
      {
        label: 'Movement speed',
        toggles: [
          { group: 'movement', field: 'ten', label: 'Movement speed (10%)' },
          { group: 'movement', field: 'fifteen', label: 'Movement speed (15%)' },
        ],
      },
      {
        label: 'Weapon mods',
        toggles: [
          { group: 'plusGems', field: 'any', label: '+1 wand (any)' },
          { group: 'plusGems', field: 'lightning', label: '+1 lightning wand' },
          { group: 'plusGems', field: 'fire', label: '+1 fire wand' },
          { group: 'plusGems', field: 'cold', label: '+1 cold wand' },
          { group: 'plusGems', field: 'phys', label: '+1 phys wand' },
          { group: 'plusGems', field: 'chaos', label: '+1 chaos wand' },
          { group: 'damage', field: 'phys', label: 'Physical damage' },
          { group: 'damage', field: 'firemult', label: 'Fire DOT multi' },
          { group: 'damage', field: 'coldmult', label: 'Cold DOT multi' },
          { group: 'damage', field: 'chaosmult', label: 'Chaos DOT multi' },
        ],
      },
      {
        label: 'Weapon bases',
        caption: "Always highlights the base, even when sockets, links or stats don't match.",
        toggles: [
          { group: 'weapon', field: 'axe', label: 'Axe' },
          { group: 'weapon', field: 'mace', label: 'Mace' },
          { group: 'weapon', field: 'sword', label: 'Sword' },
          { group: 'weapon', field: 'staff', label: 'Staff' },
          { group: 'weapon', field: 'sceptre', label: 'Sceptre' },
          { group: 'weapon', field: 'claw', label: 'Claw' },
          { group: 'weapon', field: 'bow', label: 'Bow' },
          { group: 'weapon', field: 'wand', label: 'Wand' },
          { group: 'weapon', field: 'dagger', label: 'Dagger' },
          { group: 'weapon', field: 'shield', label: 'Shield' },
        ],
      },
    ],
  },
  {
    key: 'gems',
    label: 'Gems',
    sections: [],
  },
]

const BOOLEAN_GROUPS: VendorPoe1BooleanGroup[] = [
  'links',
  'colors3',
  'colors2',
  'movement',
  'plusGems',
  'damage',
  'weapon',
]

const GEM_QUALIFIER_PREFIX = 'gems.'

/** Flatten a VendorPoe1Settings into the RegexPreset.qualifiers map: booleans as
 *  0/1 keyed `<group>.<field>`, selected gems as `gems.<id>: 1` keys. */
export function vendorPoe1SettingsToQualifiers(s: VendorPoe1Settings): Record<string, number> {
  const q: Record<string, number> = {}
  for (const group of BOOLEAN_GROUPS) {
    const obj = s[group] as Record<string, boolean>
    for (const field of Object.keys(obj)) q[`${group}.${field}`] = obj[field] ? 1 : 0
  }
  for (const id of s.gems) q[`${GEM_QUALIFIER_PREFIX}${id}`] = 1
  return q
}

/** Inverse of vendorPoe1SettingsToQualifiers. Starts from defaults so missing keys
 *  fall back to false (forward-compatible if the catalog gains toggles). */
export function qualifiersToVendorPoe1Settings(q: Record<string, number>): VendorPoe1Settings {
  const s = structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)
  for (const group of BOOLEAN_GROUPS) {
    const obj = s[group] as Record<string, boolean>
    for (const field of Object.keys(obj)) obj[field] = (q[`${group}.${field}`] ?? 0) === 1
  }
  s.gems = Object.keys(q)
    .filter((k) => k.startsWith(GEM_QUALIFIER_PREFIX) && q[k] === 1)
    .map((k) => Number(k.slice(GEM_QUALIFIER_PREFIX.length)))
    .filter((id) => Number.isFinite(id))
  return s
}

export interface VendorPoe1GroupsState {
  groups: VendorPoe1Settings[]
  selectedGroupId: number
}

export const DEFAULT_VENDOR_POE1_GROUPS_STATE: VendorPoe1GroupsState = {
  groups: [structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)],
  selectedGroupId: 0,
}

/** Count active conditions in a group: every checked toggle plus one per selected
 *  gem. Drives the group-pill summary and the "empty" gate. */
export function vendorPoe1GroupConditionCount(group: VendorPoe1Settings): number {
  let n = 0
  for (const tab of VENDOR_POE1_TABS) {
    for (const section of tab.sections) {
      for (const tg of section.toggles) {
        if ((group[tg.group] as Record<string, boolean>)[tg.field]) n++
      }
    }
  }
  return n + group.gems.length
}

/** True when the state is a single group with nothing selected. Keeps the grouping
 *  UI hidden until the user ticks their first condition. */
export function isVendorPoe1GroupsEmpty(state: VendorPoe1GroupsState): boolean {
  return state.groups.length === 1 && vendorPoe1GroupConditionCount(state.groups[0]) === 0
}

/** Flatten a grouped state into RegexPreset.qualifiers: a `groupCount` plus each
 *  group's per-field keys prefixed `g${i}.`. selectedGroupId is ephemeral and not
 *  serialized. */
export function vendorPoe1GroupsToQualifiers(state: VendorPoe1GroupsState): Record<string, number> {
  const q: Record<string, number> = { groupCount: state.groups.length }
  state.groups.forEach((group, i) => {
    const sub = vendorPoe1SettingsToQualifiers(group)
    for (const k of Object.keys(sub)) q[`g${i}.${k}`] = sub[k]
  })
  return q
}

/** Inverse of vendorPoe1GroupsToQualifiers. A qualifiers map with no `groupCount`
 *  is read as a single flat-keyed group (also covers the container's clear-all,
 *  which applies an empty qualifiers map). Always returns selectedGroupId 0. */
export function qualifiersToVendorPoe1Groups(q: Record<string, number>): VendorPoe1GroupsState {
  const count = q.groupCount
  if (!count || count < 1) {
    return { groups: [qualifiersToVendorPoe1Settings(q)], selectedGroupId: 0 }
  }
  const groups: VendorPoe1Settings[] = []
  for (let i = 0; i < count; i++) {
    const prefix = `g${i}.`
    const sub: Record<string, number> = {}
    for (const k of Object.keys(q)) {
      if (k.startsWith(prefix)) sub[k.slice(prefix.length)] = q[k]
    }
    groups.push(qualifiersToVendorPoe1Settings(sub))
  }
  return { groups, selectedGroupId: 0 }
}

/** Coerce an untrusted persisted value into a valid groups state. Foreign or
 *  partial data (e.g. PoE2 vendor state written under the poe1: key by the
 *  pre-fix in-process game switch) merges field-by-field over defaults:
 *  unknown fields drop, missing ones heal to defaults, junk resets wholesale. */
export function sanitizeVendorPoe1Groups(value: unknown): VendorPoe1GroupsState {
  if (typeof value !== 'object' || value === null) return structuredClone(DEFAULT_VENDOR_POE1_GROUPS_STATE)
  const raw = value as { groups?: unknown; selectedGroupId?: unknown }
  if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
    return structuredClone(DEFAULT_VENDOR_POE1_GROUPS_STATE)
  }
  const groups = raw.groups.map((g) => sanitizeVendorPoe1Settings(g))
  const sel = typeof raw.selectedGroupId === 'number' && Number.isFinite(raw.selectedGroupId) ? raw.selectedGroupId : 0
  return { groups, selectedGroupId: Math.min(Math.max(0, sel), groups.length - 1) }
}

function sanitizeVendorPoe1Settings(value: unknown): VendorPoe1Settings {
  const s = structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)
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
  if (Array.isArray(raw.gems)) {
    s.gems = raw.gems.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
  }
  return s
}
