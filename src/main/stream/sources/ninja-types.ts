import { z } from 'zod'

/** Shapes of poe.ninja's PoE2 builds responses, as far as Scalpel Stream reads
 *  them. Deliberately permissive: arrays fall back to empty and unknown keys are
 *  dropped, so a field poe.ninja adds or removes degrades one item instead of
 *  failing the whole character. Items are parsed one at a time for the same
 *  reason (see normalize.ts). */

const strings = z.array(z.string()).catch([])

/** GGG property/requirement/granted-skill line: `values` are [text, colour] pairs. */
export const NinjaPropertySchema = z.object({
  name: z.string(),
  values: z.array(z.tuple([z.union([z.string(), z.number()]), z.number()])).catch([]),
  displayMode: z.number().optional(),
})

const ModEntrySchema = z.object({
  id: z.string(),
  stats: z.record(z.string(), z.number()).catch({}),
})

export const NinjaItemDataSchema = z.object({
  inventoryId: z.string().optional(),
  name: z.string().catch(''),
  typeLine: z.string(),
  baseType: z.string().optional(),
  frameType: z.number().optional(),
  icon: z.string().catch(''),
  w: z.number().catch(1),
  h: z.number().catch(1),
  x: z.number().optional(),
  y: z.number().optional(),
  ilvl: z.number().optional(),
  identified: z.boolean().optional(),
  corrupted: z.boolean().optional(),
  doubleCorrupted: z.boolean().optional(),
  fractured: z.boolean().optional(),
  desecrated: z.boolean().optional(),
  sanctified: z.boolean().optional(),
  duplicated: z.boolean().optional(),
  support: z.boolean().optional(),
  socket: z.number().optional(),
  implicitMods: strings,
  explicitMods: strings,
  desecratedMods: strings,
  fracturedMods: strings,
  craftedMods: strings,
  enchantMods: strings,
  runeMods: strings,
  bondedMods: strings,
  mutatedMods: strings,
  grantedSkills: z.array(NinjaPropertySchema).catch([]),
  properties: z.array(NinjaPropertySchema).catch([]),
  requirements: z.array(NinjaPropertySchema).catch([]),
  sockets: z.array(z.object({ group: z.number().optional(), type: z.string().optional() })).catch([]),
  /** Runes, soul cores and support gems; parsed with this same schema on demand. */
  socketedItems: z.array(z.unknown()).catch([]),
  /** Gem and rune hover text. flavourText is one entry per wrapped line. */
  descrText: z.string().optional().catch(undefined),
  secDescrText: z.string().optional().catch(undefined),
  flavourText: z.array(z.string()).optional().catch(undefined),
  /** Gems: per-skill stat lines; supports list their effects in the first page. */
  gemTabs: z
    .array(z.object({ pages: z.array(z.object({ stats: strings })).catch([]) }))
    .optional()
    .catch(undefined),
  /** poe.ninja's own addition: mod ids with their rolled stat values, per category. */
  mods: z.record(z.string(), z.array(ModEntrySchema)).optional(),
})

const EntrySchema = z.object({ itemData: z.unknown() })

export const NinjaCharacterSchema = z.object({
  account: z.string(),
  name: z.string(),
  league: z.string(),
  level: z.number(),
  class: z.string(),
  items: z.array(EntrySchema).catch([]),
  flasks: z.array(EntrySchema).catch([]),
  jewels: z.array(EntrySchema).catch([]),
  skills: z
    .array(z.object({ allGems: z.array(z.object({ name: z.string().optional(), itemData: z.unknown() })).catch([]) }))
    .catch([]),
  keystones: z
    .array(
      z.object({
        name: z.string(),
        /** Tree art path relative to poe.ninja's tree assets, e.g. "passives/resonancekeystone.webp". */
        icon: z.string().nullish().catch(null),
        stats: z.array(z.string()).catch([]),
      }),
    )
    .catch([]),
  pathOfBuildingExport: z.string().nullable().catch(null),
  useSecondWeaponSet: z.boolean().catch(false),
  updatedUtc: z.string(),
})

export const NinjaIndexStateSchema = z.object({
  snapshotVersions: z.array(z.object({ url: z.string(), version: z.string() })),
})

/** One row of an account's profile (`/profile/characters/<account>/<version>`). A row
 *  that doesn't parse becomes null rather than failing the whole list. */
const NinjaProfileCharacterSchema = z.object({
  accountName: z.string(),
  name: z.string(),
  level: z.number().nullish().catch(null),
  updated: z.string(),
  isCurrent: z.boolean().catch(false),
  league: z.string().catch(''),
  leagueUrl: z.string(),
  className: z.string().nullish().catch(null),
})

export const NinjaProfileSchema = z.array(NinjaProfileCharacterSchema.nullable().catch(null))

/** `/profile/characters/<account>/<league>/<name>/model/<version>`: the builds character, wrapped. */
export const NinjaCharacterModelSchema = z.object({
  type: z.string(),
  charModel: NinjaCharacterSchema.nullish(),
})

export type NinjaProperty = z.infer<typeof NinjaPropertySchema>
export type NinjaModEntry = z.infer<typeof ModEntrySchema>
export type NinjaItemData = z.infer<typeof NinjaItemDataSchema>
export type NinjaCharacter = z.infer<typeof NinjaCharacterSchema>
