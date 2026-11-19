import type { PoeItem, PriceInfo } from '@shared/types'
import type { PriceCheckButton } from '../../plugins/use-price-check-actions'
import type { ModTier } from '@shared/data/tiers/types'
import type { ModSource } from '@shared/data/tiers/mod-sources'

export type { Listing, BulkListing } from '../../shared/trade-types'

export interface StatFilter {
  id: string
  text: string
  value: number | null
  min: number | null
  max: number | null
  enabled: boolean
  type: string
  /** Trade-API option value. For option-based stats (e.g. ultimatum chips),
   *  this is the id sent to trade - it may differ from what the user sees. */
  option?: number | string
  /** Human-readable text shown in the row's value box for option-based chips
   *  (e.g. "Defeat waves of enemies"), separate from the API id in `option`
   *  ("Exterminate"). Optional - falls back to `option` when not set. */
  displayValue?: string
  foulborn?: boolean
  /** True when a unique mod rolled at or above its best possible value (perfect, or
   *  over-rolled by Vaal/corruption above the listed max / single value). Drives the
   *  price-check default-enable for uniques (issue #378). */
  perfectRoll?: boolean
  /** True when this mod is a curated premium mod for the item's unique (premium-mods
   *  manifest); preserved through Base mode like foulborn/perfectRoll. */
  premium?: boolean
  modTier?: number
  modRange?: { min: number; max: number }
  /** Where the mod came from (influence, delve, temple, eldritch altar) when it isn't
   *  an ordinary craftable affix. Renders as a small symbol beside the mod text. */
  modSource?: ModSource
  /** Resolved tier ladder for scrubbable affixes (single-stat or trade-averaged,
   *  non-Unique). Attached by the main-process matcher; absent when not scrubbable. */
  tierLadder?: ModTier[]
  /** Quality magnitude multiplier (e.g. 1.2) for a quality-increased mod; the tierLadder
   *  ranges are unmodified, so the renderer multiplies by this for the modified search-value space. */
  tierQualityMult?: number
  /** True when `value` was synthesized by averaging/summing/computing multiple
   *  numbers (e.g. "Adds # to #" averages, weapon DPS) rather than read as a
   *  single literal number. Such values have no meaningful decimal precision,
   *  so the price-check slider scrubs them as integers. */
  aggregated?: boolean
  /** Ternary chip state: 'yes' | 'no' | undefined (= any). Also used by
   *  minmax chips: 'min' | 'max' | undefined (= off). */
  chipState?: 'yes' | 'no' | 'min' | 'max'
  /** Set true when the adaptive-defaults engine overrode this chip's enabled state. */
  learned?: boolean
  /** True when this mod has a fixed (non-rolled) value: advanced-mod range has min === max,
   *  or no ranges at all. Fixed mods are excluded from direction/bound math in overrides. */
  fixedRoll?: boolean
  /** True for a Forbidden Shako-style randomized support row (matched into the
   *  `indexable_support_*` family). Which supports the item rolled -- and how high --
   *  IS the item's price, so Base mode keeps the producer's enabled state instead of
   *  blanket-disabling it like an ordinary unique explicit (#564). */
  randomSupport?: boolean
  /** Mercenary Warrant support rows only: stat id of the skill this support sits
   *  on. Set by the main process; the renderer uses it to indent the row under
   *  its skill. */
  mercenarySkillId?: string
}

export interface PriceCheckProps {
  item: PoeItem
  priceInfo?: PriceInfo
  statFilters: StatFilter[]
  league: string
  poeVersion: 1 | 2
  chaosPerDivine?: number
  /** Divine Orb's 7-day sparkline, shipped alongside chaosPerDivine so the
   *  pair-currency header can chart the divine rate for Exalted/Chaos Orb. */
  divineGraph?: (number | null)[]
  unidCandidates?: Array<{ name: string; chaosValue: number }>
  sessionId: number
  learnedDecisions: Record<string, boolean>
  onClose: () => void
  onOpenWiki?: () => void
  pluginButtons?: PriceCheckButton[]
  onOpenPoeDb?: () => void
  onOpenNinja?: () => void
}
