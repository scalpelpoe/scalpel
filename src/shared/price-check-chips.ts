/** Misc rows Scalpel shows as Yes/No/Any chips (FilterChip `yesno` mode). */
export const TERNARY_CHIP_IDS: ReadonlySet<string> = new Set([
  'misc.corrupted',
  'misc.mirrored',
  'misc.fractured',
  'misc.vestigial',
  'misc.foulborn',
  'misc.sanctified',
])

/** Misc rows Scalpel shows as Min/Max/Off chips (FilterChip `minmax` mode). */
export const MINMAX_CHIP_IDS: ReadonlySet<string> = new Set(['misc.ilvl'])
