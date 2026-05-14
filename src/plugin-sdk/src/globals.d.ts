// Ambient: types the SDK assumes the host renderer exposes via Electron's
// preload bridge. The SDK touches a tiny subset of Scalpel's full preload
// surface (HotkeyField/HotkeyRecorder for hotkey suppression while recording,
// useCurrentZone for zone change subscriptions); we inline that subset here
// so this file ships in the published SDK without dragging in renderer or
// preload internals.
//
// Wired into the SDK's public type graph via a triple-slash reference from
// src/index.ts. Anything else that grows a `window.api.*` call inside the
// SDK's reachable surface must be added below or the consumer's typecheck
// breaks.

interface ScalpelHostZone {
  areaLevel: number
  areaCode: string
}

declare global {
  interface Window {
    api: {
      /** Tells Scalpel to ignore its global hotkeys while the plugin's
       *  hotkey recorder is capturing a key combo. */
      suspendHotkeys(): void
      /** Inverse of `suspendHotkeys`. */
      resumeHotkeys(): void
      /** Subscribe to zone-change events. Returns an unsubscribe function. */
      onZoneChanged(cb: (zone: ScalpelHostZone | null) => void): () => void
    }
  }
}

export {}
