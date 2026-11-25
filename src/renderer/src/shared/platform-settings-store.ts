import { useCallback, useSyncExternalStore } from 'react'
import { PLATFORM_GAME_MODE_POLL_MS, type PlatformSettingsPayload } from '@shared/contracts/platform-settings'

// One shared snapshot per renderer process: the window banner stack and the
// settings tab both read it, so game-mode polling happens once per window.
let snapshot: PlatformSettingsPayload | null = null
let timer: ReturnType<typeof setInterval> | null = null
let requestId = 0
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export async function refreshPlatformSettings(): Promise<void> {
  const current = ++requestId
  try {
    const next = await window.api.getPlatformSettings()
    if (current === requestId) snapshot = next
  } catch {
    // Keep the last good snapshot; a transient IPC failure should not flash the
    // restart and mismatch banners away.
  } finally {
    if (current === requestId) notify()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!timer) {
    void refreshPlatformSettings()
    timer = setInterval(() => void refreshPlatformSettings(), PLATFORM_GAME_MODE_POLL_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot(): PlatformSettingsPayload | null {
  return snapshot
}

export function usePlatformSettings(enabled = true): PlatformSettingsPayload | null {
  const subscribeEnabled = useCallback((listener: () => void) => (enabled ? subscribe(listener) : () => {}), [enabled])
  return useSyncExternalStore(subscribeEnabled, getSnapshot, getSnapshot)
}

/** Test-only reset so mocked bridges do not leak between rendered windows. */
export function resetPlatformSettingsStore(): void {
  requestId++
  snapshot = null
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  listeners.clear()
}
