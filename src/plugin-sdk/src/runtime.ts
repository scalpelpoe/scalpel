// Runtime entry for the SDK. Served at scalpel-internal://sdk.js when plugins
// import '@filterscalpel/plugin-sdk'. Forwards Scalpel's pure utility helpers
// so plugins don't reimplement them.
//
// Only PURE functions live here. State-bound helpers (iconMap, IPC-backed
// hooks), large JSON-data modules, and React components belong to a later
// plan that handles the shared-state plumbing.

export { isClusterJewel, isSkillGem, SKILL_GEM_CLASSES, defaultPoeItem } from '../../shared/poe-item'
export type { PoeItem, Zone } from '../../shared/types'

export { externalLinkUrl, ninjaLinkUrl, deriveItemVariant, ninjaLeagueSegment } from '../../shared/external-link'
export type { ExternalLinkTarget, NinjaItemRef } from '../../shared/external-link'

export { getGameFeatures } from '../../shared/game-features'
export type { GameFeatures } from '../../shared/game-features'

export { compareVersions, versionMatches } from '../../shared/version-match'

export { isTownOrHideout } from '../../shared/is-town-or-hideout'

export { formatPrice, formatDust } from '../../renderer/src/shared/utils'

export {
  getTrendDirection,
  TREND_UP_COLOR,
  TREND_DOWN_COLOR,
  TREND_THRESHOLD_PCT,
} from '../../renderer/src/shared/price-trend'
export type { TrendDirection } from '../../renderer/src/shared/price-trend'

export { RARITY_COLORS } from '../../shared/rarity-colors'

export { getDustInfo } from '../../renderer/src/shared/dust'

export { findRelated } from '../../renderer/src/shared/related-items'
export type { RelatedRef, RelatedEntry } from '../../renderer/src/shared/related-items'

export { useCurrentZone } from '../../renderer/src/shared/use-current-zone'

export { Toggle } from '../../renderer/src/components/Toggle'
export { Notice } from '../../renderer/src/overlay/Notice'
export { ErrorBanner } from '../../renderer/src/components/ErrorBanner'
