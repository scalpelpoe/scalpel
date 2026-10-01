import { z } from 'zod'

/** Item art must come from GGG's CDN, one of the Twitch extension's allowlisted image hosts. */
export const POECDN_PREFIX = 'https://web.poecdn.com/'

/** poe.ninja's asset host (passive tree art, class portraits), the other allowlisted image host. */
export const NINJA_ASSETS_PREFIX = 'https://assets.poe.ninja/'

/** The streamer's pathofexile.com profile; the only place the item-filter link may point. */
export const POE_PROFILE_PREFIX = 'https://www.pathofexile.com/account/view-profile/'

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

/** A streamer-supplied page viewers open in a new tab. */
const webUrl = z.url({ protocol: /^https?$/ }).max(LIMITS.string)

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
  /** Desecrated mod, drawn in the desecrated colour wherever it sits in the block. */
  desecrated: z.literal(true).optional(),
  tier: TierSchema.optional(),
  /** Roll range of the tier this line rolled in. */
  range: z.strictObject({ min: z.number(), max: z.number() }).optional(),
})

export const ModSectionSchema = z.strictObject({
  kind: z.enum(['enchant', 'rune', 'implicit', 'explicit', 'desecrated', 'bonded', 'granted-skill', 'description', 'flavour']),
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

/** A gem or rune hover card: the part of an item the game draws for it. The viewer renders it with the
 *  item tooltip and fills the omitted fields (size, ilvl, flags, sockets, price) with defaults. */
export const CardSchema = z.strictObject({
  name: text.nullable(),
  baseType: text,
  rarity: RaritySchema,
  icon: iconUrl,
  properties: z.array(z.strictObject({ name: text, value: text.nullable() })).max(LIMITS.properties),
  requirements: z.array(z.strictObject({ name: text, value: text })).max(LIMITS.requirements),
  sections: z.array(ModSectionSchema).max(LIMITS.sections),
})

export const SocketSchema = z.strictObject({
  kind: z.enum(['rune', 'gem', 'jewel', 'other']),
  name: text.nullable(),
  icon: iconUrl.nullable(),
  /** Hover card for the socketed rune; absent when the source has no data for it. */
  card: CardSchema.optional(),
})

export const PriceSchema = z.strictObject({
  amount: z.number().nonnegative(),
  currency: z.enum(['exalted', 'divine', 'chaos']),
})

const JsonPathSchema = z.array(z.union([z.string().max(64), z.number().int().nonnegative()])).max(12)

export const QueryOpSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('delete'), path: JsonPathSchema }),
  z.strictObject({ op: z.literal('disable'), path: JsonPathSchema }),
  /** Writes `value` at `path`, creating missing intermediate objects. */
  z.strictObject({ op: z.literal('set'), path: JsonPathSchema, value: z.custom<unknown>((v) => v !== undefined) }),
])

/** Chip states; 'none' is Any for a yesno chip and Off for a minmax chip. */
export const ChipStateSchema = z.enum(['yes', 'no', 'min', 'max', 'none'])

const CHIP_MODE_STATES = {
  yesno: ['yes', 'no', 'none'],
  minmax: ['min', 'max', 'none'],
} as const

export const PriceCheckChipSchema = z
  .strictObject({
    mode: z.enum(['yesno', 'minmax']),
    default: ChipStateSchema,
    /** Ops applied to the all-on query to move the chip from its default to each state. */
    states: z.partialRecord(ChipStateSchema, z.array(QueryOpSchema).max(16)),
  })
  .superRefine((chip, ctx) => {
    const allowed: readonly string[] = CHIP_MODE_STATES[chip.mode]
    for (const key of Object.keys(chip.states)) {
      if (!allowed.includes(key)) {
        ctx.addIssue({ code: 'custom', path: ['states', key], message: `${chip.mode} chips cannot use state '${key}'` })
      }
    }
    if (!allowed.includes(chip.default)) {
      ctx.addIssue({ code: 'custom', path: ['default'], message: `${chip.mode} chips cannot default to '${chip.default}'` })
    }
    if (!(chip.default in chip.states)) {
      ctx.addIssue({ code: 'custom', path: ['default'], message: 'default must be a key of states' })
    }
  })

export const PriceCheckRowSchema = z.strictObject({
  id: z.string().max(LIMITS.string),
  text,
  /** StatFilter.type: 'explicit' | 'implicit' | 'pseudo' | 'rune' | 'misc' | ... drives row colour. */
  type: z.string().max(32),
  value: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  modTier: z.number().int().optional(),
  modRange: z.strictObject({ min: z.number(), max: z.number() }).optional(),
  defaultEnabled: z.boolean(),
  /** Shown at its default state; the viewer can't toggle or edit it. */
  locked: z.boolean(),
  /** Applied to the all-on query when the viewer turns this row off. */
  offOps: z.array(QueryOpSchema).max(16),
  minPath: JsonPathSchema.nullable(),
  maxPath: JsonPathSchema.nullable(),
  /** Yes/No/Any or Min/Max/Off chip; absent on plain rows and 0.3.0-era rows. */
  chip: PriceCheckChipSchema.optional(),
})

export const PriceCheckSchema = z.strictObject({
  league: z.string().min(1).max(64),
  /** trade2 search body with every toggleable row on: { query, sort }. */
  body: z.record(z.string(), z.unknown()),
  rows: z.array(PriceCheckRowSchema).max(40),
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
  /** Viewer price check; absent on 0.3.0 snapshots or when the item can't be price-checked. */
  priceCheck: PriceCheckSchema.optional(),
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
    card: CardSchema.optional(),
  }),
  supports: z
    .array(z.strictObject({ name: text, icon: iconUrl.nullable(), card: CardSchema.optional() }))
    .max(LIMITS.supportsPerSkill),
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
  /** Pages the streamer links viewers to. Optional so snapshots published before links existed still parse. */
  links: z
    .strictObject({
      /** The streamer's public item filters on pathofexile.com. */
      filters: z.string().max(LIMITS.string).startsWith(POE_PROFILE_PREFIX).nullable(),
      /** A video or written guide for the build. */
      buildGuide: webUrl.nullable(),
    })
    .optional(),
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
export type Card = z.infer<typeof CardSchema>
export type Socket = z.infer<typeof SocketSchema>
export type QueryOp = z.infer<typeof QueryOpSchema>
export type JsonPath = z.infer<typeof JsonPathSchema>
export type PriceCheckRow = z.infer<typeof PriceCheckRowSchema>
export type ChipState = z.infer<typeof ChipStateSchema>
export type PriceCheckChip = z.infer<typeof PriceCheckChipSchema>
export type PriceCheck = z.infer<typeof PriceCheckSchema>
export type Price = z.infer<typeof PriceSchema>
export type SnapshotItem = z.infer<typeof SnapshotItemSchema>
export type Equipment = z.infer<typeof EquipmentSchema>
export type SnapshotSkill = z.infer<typeof SnapshotSkillSchema>
export type StreamSnapshot = z.infer<typeof StreamSnapshotSchema>
