// Runtime entry for the SDK. Served at scalpel-internal://sdk.js when plugins
// import '@scalpelpoe/plugin-sdk'. Forwards Scalpel's pure utility helpers
// so plugins don't reimplement them.
//
// Only PURE functions live here. State-bound helpers (iconMap, IPC-backed
// hooks), large JSON-data modules, and React components belong to a later
// plan that handles the shared-state plumbing.

export { ErrorBanner } from '../../renderer/src/components/ErrorBanner'
export { LeagueDropdown } from '../../renderer/src/components/LeagueDropdown'
export { Button } from '../../renderer/src/components/primitives/Button'
export { Label } from '../../renderer/src/components/primitives/Label'
export { Slider } from '../../renderer/src/components/primitives/Slider'
export { Textarea } from '../../renderer/src/components/primitives/Textarea'
export { TextInput } from '../../renderer/src/components/primitives/TextInput'
export { RemoveButton } from '../../renderer/src/components/RemoveButton'
export { ScrubInput } from '../../renderer/src/components/regex-tool/ScrubInput'
export { HotkeyField } from '../../renderer/src/components/settings/HotkeyField'
export { HotkeyRecorder } from '../../renderer/src/components/settings/HotkeyRecorder'
export { SettingSelectBox } from '../../renderer/src/components/settings/SettingSelectBox'
export { SettingToggleBox } from '../../renderer/src/components/settings/SettingToggleBox'
export { keyEventToAccelerator, prettyHotkey } from '../../renderer/src/components/settings/utils'
export { Toggle } from '../../renderer/src/components/Toggle'
export { Notice } from '../../renderer/src/overlay/Notice'
export { getDustInfo } from '../../renderer/src/shared/dust'
export { ExternalLinkButton } from '../../renderer/src/shared/ExternalLinkButton'
export { InfoChip } from '../../renderer/src/shared/InfoChip'
export type { TrendDirection } from '../../renderer/src/shared/price-trend'
export {
  getTrendDirection,
  TREND_DOWN_COLOR,
  TREND_THRESHOLD_PCT,
  TREND_UP_COLOR,
} from '../../renderer/src/shared/price-trend'
export type { RelatedEntry, RelatedRef } from '../../renderer/src/shared/related-items'
export { findRelated } from '../../renderer/src/shared/related-items'
export { useCurrentZone } from '../../renderer/src/shared/use-current-zone'
export { formatDust, formatPrice } from '../../renderer/src/shared/utils'
export type { ExternalLinkTarget, NinjaItemRef } from '../../shared/external-link'
export { deriveItemVariant, externalLinkUrl, ninjaLeagueSegment, ninjaLinkUrl } from '../../shared/external-link'
export type { GameFeatures } from '../../shared/game-features'
export { getGameFeatures } from '../../shared/game-features'
export { isTownOrHideout } from '../../shared/is-town-or-hideout'
export { defaultPoeItem, isClusterJewel, isSkillGem, SKILL_GEM_CLASSES } from '../../shared/poe-item'
export { RARITY_COLORS } from '../../shared/rarity-colors'
export type { PoeItem, Zone } from '../../shared/types'
export { compareVersions, versionMatches } from '../../shared/version-match'

export { ItemChip } from './components/ItemChip'
export { getItemIcon } from './runtime-helpers/get-item-icon'
