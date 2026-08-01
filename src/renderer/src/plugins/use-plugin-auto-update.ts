import { useCallback, useEffect, useRef } from 'react'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { selectAutoUpdateCandidates } from './plugin-auto-update'

export interface AppliedUpdate {
  name: string
  version: string
}

export interface UsePluginAutoUpdateOptions {
  /** Called on the next overlay-show after one or more silent updates applied,
   *  with the list to surface as a toast. */
  onApplied: (applied: AppliedUpdate[]) => void
  /** Current pluginAutoUpdate value from the host's settings state. Passing it
   *  lets the hook re-check the instant the toggle flips in THIS window, since
   *  the cross-window setting-updated broadcast skips the sender. Only a change
   *  signal; the authoritative value is re-read from getSettings on each check. */
  enabled?: boolean
  /** Current pluginRegistryUrl (empty/undefined = curated). Same change-signal
   *  rationale as enabled. */
  registryUrl?: string
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Opt-in silent plugin auto-update. Mounted once in the always-alive overlay.
 *  Checks the curated registry on launch + every 24h (and when the opt-in flips),
 *  and applies outdated plugins while the overlay is hidden so nothing reloads
 *  under the user. */
export function usePluginAutoUpdate({ onApplied, enabled, registryUrl }: UsePluginAutoUpdateOptions): void {
  const onAppliedRef = useRef(onApplied)
  onAppliedRef.current = onApplied

  // Mutable state in refs so check/applyPending stay stable across renders (the
  // setting-change effect re-runs them without tearing down subscriptions or
  // resetting the hidden/pending state).
  const pendingRef = useRef<RegistryEntry[]>([])
  const appliedQueueRef = useRef<AppliedUpdate[]>([])
  const hiddenRef = useRef(true) // the overlay starts hidden at launch
  const applyingRef = useRef(false)
  const cancelledRef = useRef(false)

  const check = useCallback(async (): Promise<void> => {
    const settings = await window.api.getSettings().catch(() => null)
    if (cancelledRef.current || !settings) return
    const gate = {
      enabled: settings.pluginAutoUpdate === true,
      customRegistry: Boolean(settings.pluginRegistryUrl && settings.pluginRegistryUrl.length > 0),
    }
    if (!gate.enabled || gate.customRegistry) {
      pendingRef.current = []
      return
    }
    const [installed, reg] = await Promise.all([window.api.listInstalledPlugins(), window.api.pluginFetchRegistry()])
    if (cancelledRef.current) return
    const snapshot = reg.ok ? reg.snapshot : null
    pendingRef.current = selectAutoUpdateCandidates(snapshot, installed, gate)
  }, [])

  const applyPending = useCallback(async (): Promise<void> => {
    if (applyingRef.current || !hiddenRef.current || pendingRef.current.length === 0) return
    applyingRef.current = true
    try {
      for (const entry of [...pendingRef.current]) {
        // Stop if unmounted or the overlay was opened mid-apply (a long download
        // could span a show); leftover pending applies next hide.
        if (cancelledRef.current || !hiddenRef.current) break
        // Honor "apply when idle": leave a pop-out the user is looking at alone.
        const popVisible = await window.api.pluginOverlayVisible(entry.id).catch(() => false)
        if (popVisible) continue
        const r = await window.api.pluginUpdateFromRegistry(entry)
        // Drop from pending whether it succeeded or failed; a failure (incl.
        // scalpelMinVersion too high) is re-evaluated on the next check, so we
        // never retry on every hide.
        const i = pendingRef.current.findIndex((e) => e.id === entry.id)
        if (i >= 0) pendingRef.current.splice(i, 1)
        if (r.ok) appliedQueueRef.current.push({ name: entry.name, version: entry.latestVersion })
      }
    } finally {
      applyingRef.current = false
    }
  }, [])

  // Subscriptions, launch check, and the 24h interval. check/applyPending are
  // stable, so this runs once per mount.
  useEffect(() => {
    cancelledRef.current = false
    const onHide = (): void => {
      hiddenRef.current = true
      void applyPending()
    }
    const onShow = (): void => {
      hiddenRef.current = false
      if (appliedQueueRef.current.length > 0) {
        onAppliedRef.current([...appliedQueueRef.current])
        appliedQueueRef.current = []
      }
    }
    const offHide = window.api.onOverlayHide(onHide)
    const offShow = window.api.onOverlayShow(onShow)
    const offSetting = window.api.onSettingUpdated((key) => {
      if (key === 'pluginAutoUpdate' || key === 'pluginRegistryUrl') void check().then(() => applyPending())
    })

    void check().then(() => applyPending())
    const interval = setInterval(() => void check().then(() => applyPending()), CHECK_INTERVAL_MS)

    return () => {
      cancelledRef.current = true
      offHide()
      offShow()
      offSetting()
      clearInterval(interval)
    }
  }, [check, applyPending])

  // Same-window opt-in: when the toggle (or registry) changes in THIS window, the
  // cross-window setting-updated broadcast skips us, so re-check here on the prop
  // change. applyPending no-ops while the overlay is shown, so a toggle made in
  // the settings tab does not reload anything until the overlay hides.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    void check().then(() => applyPending())
  }, [enabled, registryUrl, check, applyPending])
}
