/**
 * Renderer API adapter for overlay lifecycle, events, and control.
 *
 * Preparatory wrappers around window.api. Existing renderer code still calls the
 * preload bridge directly; migrate call sites incrementally when touching overlay
 * screens.
 */

import type { ExternalLinkTarget } from '@shared/external-link'
import type { OverlayData, Zone } from '@shared/contracts/items'

export function closeOverlay(): void {
  window.api.closeOverlay()
}

export function getOverlayState(): Promise<{
  poeVersion: 1 | 2
  gameBounds: { gameWidth: number; gameHeight: number; sidebarWidth: number } | null
}> {
  return window.api.getOverlayState()
}

export function getIconCache(): Promise<Record<string, string>> {
  return window.api.getIconCache()
}

export function onIconCacheUpdated(cb: (added: Record<string, string>) => void): () => void {
  return window.api.onIconCacheUpdated(cb)
}

export function reportPanelRect(
  rects:
    | { left: number; top: number; width: number; height: number }
    | Array<{ left: number; top: number; width: number; height: number }>,
): void {
  window.api.reportPanelRect(rects)
}

export function lockInteractive(): void {
  window.api.lockInteractive()
}

export function unlockInteractive(): void {
  window.api.unlockInteractive()
}

export function suspendHotkeys(): void {
  window.api.suspendHotkeys()
}

export function resumeHotkeys(): void {
  window.api.resumeHotkeys()
}

export function suspendInputHook(): Promise<void> {
  return window.api.suspendInputHook()
}

export function resumeInputHook(): Promise<void> {
  return window.api.resumeInputHook()
}

export function setOverlayInputFocused(focused: boolean): void {
  window.api.setOverlayInputFocused(focused)
}

export function saveOverlayState(state: Record<string, unknown>): void {
  window.api.saveOverlayState(state)
}

// ── Events ────────────────────────────────────────────────────────────────────

export function onOverlayData(cb: (data: OverlayData) => void): () => void {
  return window.api.onOverlayData(cb)
}

export function onCursorSide(cb: (side: 'left' | 'right') => void): () => void {
  return window.api.onCursorSide(cb)
}

export function onNoFilterLoaded(cb: () => void): () => void {
  return window.api.onNoFilterLoaded(cb)
}

export function onNoItemInClipboard(cb: () => void): () => void {
  return window.api.onNoItemInClipboard(cb)
}

export function onOpenSettings(cb: () => void): () => void {
  return window.api.onOpenSettings(cb)
}

export function onOpenView(cb: (view: string, tab?: string) => void): () => void {
  return window.api.onOpenView(cb)
}

export function onOpenLinkPending(cb: (target: ExternalLinkTarget) => void): () => void {
  return window.api.onOpenLinkPending(cb)
}

export function onOverlayHide(cb: () => void): () => void {
  return window.api.onOverlayHide(cb)
}

export function onSkipAnimation(cb: () => void): () => void {
  return window.api.onSkipAnimation(cb)
}

export function onPoeVersion(cb: (version: 1 | 2) => void): () => void {
  return window.api.onPoeVersion(cb)
}

export function onZoneChanged(cb: (zone: Zone | null) => void): () => void {
  return window.api.onZoneChanged(cb)
}

export function onGameBounds(
  cb: (bounds: { gameWidth: number; gameHeight: number; sidebarWidth: number }) => void,
): () => void {
  return window.api.onGameBounds(cb)
}

export function onElevationHint(cb: () => void): () => void {
  return window.api.onElevationHint(cb)
}

export function onOverlayDetach(cb: () => void): () => void {
  return window.api.onOverlayDetach(cb)
}

export function onOverlayReattach(cb: () => void): () => void {
  return window.api.onOverlayReattach(cb)
}

export function openDevTools(): void {
  window.api.openDevTools()
}
