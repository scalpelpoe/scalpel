import type { OverlayData, MatchResult, TierGroup } from '../../../shared/types'

export interface ActiveMatch {
  match: MatchResult | null
  tierGroup: TierGroup | undefined
}

/**
 * Pick the match + tier group to display based on which (if any) breakpoint the
 * user has selected. Preference: strand > quality > stack > no-breakpoint default
 * (the item's actual match from the filter run). A single-entry breakpoint list
 * isn't considered a "selection" -- callers only see an override when there are
 * multiple breakpoints to choose from. Used by FilterPanel, AuditView, and App
 * so the filter page, audit page, and overlay sister all agree on which block
 * the user is currently looking at.
 */
export function getActiveMatch(
  overlayData: OverlayData,
  selectedBpIndex: number | null,
  selectedQualityBpIndex: number | null,
  selectedStrandBpIndex: number | null,
): ActiveMatch {
  const { matches, stackBreakpoints, qualityBreakpoints, strandBreakpoints, tierGroup } = overlayData

  if (strandBreakpoints && strandBreakpoints.length > 1 && selectedStrandBpIndex !== null) {
    const bp = strandBreakpoints[selectedStrandBpIndex]
    if (bp?.activeMatch) return { match: bp.activeMatch, tierGroup: bp.tierGroup }
  }
  if (qualityBreakpoints && qualityBreakpoints.length > 1 && selectedQualityBpIndex !== null) {
    const bp = qualityBreakpoints[selectedQualityBpIndex]
    if (bp?.activeMatch) return { match: bp.activeMatch, tierGroup: bp.tierGroup }
  }
  if (stackBreakpoints && stackBreakpoints.length > 1 && selectedBpIndex !== null) {
    const bp = stackBreakpoints[selectedBpIndex]
    if (bp?.activeMatch) return { match: bp.activeMatch, tierGroup: bp.tierGroup }
  }

  return { match: matches.find((m) => m.isFirstMatch) ?? matches[0] ?? null, tierGroup }
}
