import { z } from 'zod'

/** Item art must come from GGG's CDN, one of the Twitch extension's allowlisted image hosts. */
export const POECDN_PREFIX = 'https://web.poecdn.com/'

/** poe.ninja's asset host (passive tree art, class portraits), the other allowlisted image host. */
export const NINJA_ASSETS_PREFIX = 'https://assets.poe.ninja/'

export const LIMITS = {
  snapshotBytes: 256 * 1024,
  items: 64,
  string: 2048,
  pob: 64 * 1024,
  sections: 16,
  linesPerSection: 64,
  properties: 32,
  requirements: 16,
  sockets: 8,
  flasks: 5,
  charms: 5,
  skills: 32,
  supportsPerSkill: 10,
  keystones: 64,
  keystoneStats: 12,
  patches: 16,
} as const

export const SLOTS = [
  'Weapon',
  'Offhand',
  'Weapon2',
  'Offhand2',
  'Helm',
  'BodyArmour',
  'Gloves',
  'Boots',
  'Amulet',
  'Ring',
  'Ring2',
  'Ring3',
  'Belt',
] as const

export const SlotSchema = z.enum(SLOTS)

const text = z.string().max(LIMITS.string)
const utc = z.iso.datetime()
const iconUrl = z.string().max(LIMITS.string).startsWith(POECDN_PREFIX)
const treeArtUrl = z
  .string()
  .max(LIMITS.string)
  .refine((url) => url.startsWith(POECDN_PREFIX) || url.startsWith(NINJA_ASSETS_PREFIX), {
    message: 'Art must come from web.poecdn.com or assets.poe.ninja',
  })

export const RaritySchema = z.enum(['normal', 'magic', 'rare', 'unique', 'gem', 'currency'])

export const TierSchema = z.strictObject({
  /** Absent when the source can't tell prefixes from suffixes; the label is then "T<num>". */
  affix: z.enum(['prefix', 'suffix']).optional(),
  num: z.number().int().min(1).max(99),
  /** Display label such as "P1", "S3", or "T2". Viewers render this verbatim. */
  label: z.string().max(8),
})

export const ModLineSchema = z.strictObject({
  /** Plain display text; GGG markup like [Evasion|Evasion Rating] is already stripped. */
  text,
  fractured: z.literal(true).optional(),
  crafted: z.literal(true).optional(),
  tier: TierSchema.optional(),
  /** Roll range of the tier this line rolled in. */
  range: z.strictObject({ min: z.number(), max: z.number() }).optional(),
})

export const ModSectionSchema = z.strictObject({
  kind: z.enum(['enchant', 'rune', 'implicit', 'explicit', 'desecrated', 'bonded', 'granted-skill']),
  lines: z.array(ModLineSchema).max(LIMITS.linesPerSection),
})

export const ItemFlagsSchema = z.strictObject({
  corrupted: z.literal(true).optional(),
  doubleCorrupted: z.literal(true).optional(),
  fractured: z.literal(true).optional(),
  desecrated: z.literal(true).optional(),
  sanctified: z.literal(true).optional(),
  mirrored: z.literal(true).optional(),
  unidentified: z.literal(true).optional(),
})

export const SocketSchema = z.strictObject({
  kind: z.enum(['rune', 'gem', 'jewel', 'other']),
  name: text.nullable(),
  icon: iconUrl.nullable(),
})

export const PriceSchema = z.strictObject({
  amount: z.number().nonnegative(),
  currency: z.enum(['exalted', 'divine', 'chaos']),
})

export const SnapshotItemSchema = z.strictObject({
  /** Unique/rare name, or the full magic name; null when the item shows only its base type. */
  name: text.nullable(),
  baseType: text,
  rarity: RaritySchema,
  icon: iconUrl,
  /** Inventory cells, for layout. */
  w: z.number().int().min(1).max(4),
  h: z.number().int().min(1).max(4),
  ilvl: z.number().int().min(0).max(100).nullable(),
  flags: ItemFlagsSchema,
  properties: z.array(z.strictObject({ name: text, value: text.nullable() })).max(LIMITS.properties),
  requirements: z.array(z.strictObject({ name: text, value: text })).max(LIMITS.requirements),
  /** Ordered the way the in-game tooltip orders them. */
  sections: z.array(ModSectionSchema).max(LIMITS.sections),
  sockets: z.array(SocketSchema).max(LIMITS.sockets),
  /** Uniques only. */
  price: PriceSchema.nullable(),
})

const optionalItem = SnapshotItemSchema.optional()

export const EquipmentSchema = z.strictObject({
  Weapon: optionalItem,
  Offhand: optionalItem,
  Weapon2: optionalItem,
  Offhand2: optionalItem,
  Helm: optionalItem,
  BodyArmour: optionalItem,
  Gloves: optionalItem,
  Boots: optionalItem,
  Amulet: optionalItem,
  Ring: optionalItem,
  Ring2: optionalItem,
  Ring3: optionalItem,
  Belt: optionalItem,
})

export const SnapshotSkillSchema = z.strictObject({
  gem: z.strictObject({
    name: text,
    icon: iconUrl.nullable(),
    level: z.number().int().min(0).max(40).nullable(),
    quality: z.number().int().min(0).max(40).nullable(),
  }),
  supports: z.array(z.strictObject({ name: text, icon: iconUrl.nullable() })).max(LIMITS.supportsPerSkill),
})

export const KeystoneSchema = z.strictObject({
  name: text,
  icon: treeArtUrl.nullable(),
  /** What the keystone does, one entry per stat line, as display text. */
  stats: z.array(text).max(LIMITS.keystoneStats),
})

export const StreamSnapshotSchema = z.strictObject({
  schema: z.literal(1),
  game: z.literal('poe2'),
  character: z.strictObject({
    /** Null when the streamer hides the character name. */
    name: text.nullable(),
    class: text,
    level: z.number().int().min(1).max(100),
    league: text,
    activeWeaponSet: z.union([z.literal(1), z.literal(2)]),
  }),
  /** Where the gear came from and when that source last saw it. */
  source: z.strictObject({ kind: z.string().min(1).max(32), updatedUtc: utc }),
  /** When Scalpel built this snapshot. */
  publishedUtc: utc,
  equipment: EquipmentSchema,
  flasks: z.array(SnapshotItemSchema).max(LIMITS.flasks),
  charms: z.array(SnapshotItemSchema).max(LIMITS.charms),
  jewels: z.array(SnapshotItemSchema).max(LIMITS.items),
  /** Items in slots the viewer has no fixed place for. */
  other: z.array(SnapshotItemSchema).max(LIMITS.items),
  skills: z.array(SnapshotSkillSchema).max(LIMITS.skills),
  keystones: z.array(KeystoneSchema).max(LIMITS.keystones),
  /** Path of Building export code for "Copy PoB". */
  pob: z.string().max(LIMITS.pob).nullable(),
  /** Slots overridden by the streamer's hotkey patches. */
  patches: z.array(z.strictObject({ slot: SlotSchema, atUtc: utc })).max(LIMITS.patches),
})

export type Slot = z.infer<typeof SlotSchema>
export type Keystone = z.infer<typeof KeystoneSchema>
export type Rarity = z.infer<typeof RaritySchema>
export type Tier = z.infer<typeof TierSchema>
export type ModLine = z.infer<typeof ModLineSchema>
export type ModSection = z.infer<typeof ModSectionSchema>
export type ItemFlags = z.infer<typeof ItemFlagsSchema>
export type Socket = z.infer<typeof SocketSchema>
export type Price = z.infer<typeof PriceSchema>
export type SnapshotItem = z.infer<typeof SnapshotItemSchema>
export type Equipment = z.infer<typeof EquipmentSchema>
export type SnapshotSkill = z.infer<typeof SnapshotSkillSchema>
export type StreamSnapshot = z.infer<typeof StreamSnapshotSchema>
