/**
 * Renderer API adapter for regex presets and remote overlay.
 *
 * Prefer importing from this module in new feature code rather than calling
 * window.api directly.
 */

import type { RegexPreset } from '../../../../../shared/contracts/regex'

export function getRegexPresets(): Promise<RegexPreset[]> {
  return window.api.getRegexPresets()
}

export function saveRegexPreset(preset: RegexPreset): Promise<RegexPreset[]> {
  return window.api.saveRegexPreset(preset)
}

export function deleteRegexPreset(id: string): Promise<RegexPreset[]> {
  return window.api.deleteRegexPreset(id)
}

export function reorderRegexPresets(ids: string[]): Promise<RegexPreset[]> {
  return window.api.reorderRegexPresets(ids)
}

export function reportRegex(regex: string): void {
  window.api.reportRegex(regex)
}

export function onRegexPresetsChanged(cb: () => void): () => void {
  return window.api.onRegexPresetsChanged(cb)
}

// ── Regex remote ──────────────────────────────────────────────────────────────

export function regexRemoteApply(presetId: string): void {
  window.api.regexRemoteApply(presetId)
}

export function closeRegexRemote(): void {
  window.api.closeRegexRemote()
}

export function regexRemoteHandFocus(): void {
  window.api.regexRemoteHandFocus()
}

export function regexRemoteMountState(): Promise<boolean> {
  return window.api.regexRemoteMountState()
}

export function onRegexRemoteMountChanged(cb: (flush: boolean) => void): () => void {
  return window.api.onRegexRemoteMountChanged(cb)
}
