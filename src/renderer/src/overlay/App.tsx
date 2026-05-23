import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PluginHost } from '../plugins/PluginHost'
import { PluginTabHost } from '../plugins/PluginTabHost'
import type { RegisteredTab } from '../plugins/PluginHost'
import type { AppSettings, OverlayData, PoeItem, PriceInfo } from '../../../shared/types'
import { isHideableTabKey } from '../../../shared/types'
import type { ExternalLinkTarget } from '../../../shared/external-link'
import { externalLinkUrl, ninjaLinkUrl } from '../../../shared/external-link'
import { getGameFeatures } from '../../../shared/game-features'
import { PoeVersionProvider } from '../shared/poe-version-context'
import { useReportInputFocus } from '../shared/use-report-input-focus'
import { useCurrentZone } from '../shared/use-current-zone'
import { FilterPanel } from '../components/FilterPanel'
import { SettingsPanel } from '../components/SettingsPanel'
import { SocketRecolor } from '../components/SocketRecolor'
import { DustExplorer } from '../components/dust-explorer'
import { DivCardExplorer } from '../components/div-card-explorer'
import { RegexTool } from '../components/regex-tool'
import { PriceCheck } from '../components/price-check'
import { PriceCheckSkeleton } from '../components/price-check/PriceCheckSkeleton'
import { SnapGhosts } from './SnapGhosts'
import { TitleBar } from './TitleBar'
import { ErrorBanner } from '../components/ErrorBanner'
import { UpdateBanner } from './UpdateBanner'
import { FilterInfoBanner } from './FilterInfoBanner'
import { AuditView } from './AuditView'
import { Notice } from './Notice'
import { SisterOverlay } from './SisterOverlay'
import { TierItemsSister } from './TierItemsSister'
import { getActiveMatch } from '../shared/activeMatch'
import { ItemSearchCombobox } from '../components/ItemSearchCombobox'
import { Clipboard } from '@icon-park/react'
import {
  IP,
  iconMap,
  divCardArtMap,
  initIconMap,
  initItemClassMaps,
  initUniquesByBase,
  mergeIconCache,
} from '../shared/constants'
import { initManifest, getManifest } from '../shared/manifest'
import { prettyHotkey } from '../components/settings'
import { PluginErrorBanner } from '../plugins/PluginErrorBanner'
import type { BrokenPlugin } from '../plugins/PluginErrorBanner'
import type { View } from './view'

/** Shape published to globalThis.__scalpel so the plugin SDK can read live
 *  icon maps without importing renderer-internal modules directly. */
interface ScalpelGlobal {
  iconMap: Record<string, string>
  divCardArtMap: Map<string, string>
}

const PANEL_WIDTH = 540
const PANEL_TOP = 8

/** How long the macro's pending-target ref stays armed before we drop it.
 *  Without this, a failed price-check (no overlay-data ever arrives) would
 *  leave the ref true and fire the wiki/poedb open on the user's NEXT
 *  unrelated price-check. 5s is well past a normal round-trip. */
const EXTERNAL_LINK_PENDING_TTL_MS = 5000

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('idle')
  // External requests to focus a specific settings tab (e.g. cheat-sheets
  // overlay's "Open Sheet Settings" button). Counter bumps each time so
  // SettingsPanel can detect re-requests for the same tab. Cleared whenever
  // the user leaves settings so a later gear-icon open doesn't inherit a
  // stale request from a previous cheat-sheet-driven open.
  const [settingsTabRequest, setSettingsTabRequest] = useState<{ tab: string; n: number } | null>(null)
  useEffect(() => {
    if (view !== 'setup') setSettingsTabRequest(null)
  }, [view])
  const [closing, setClosing] = useState(false)
  const showCountRef = useRef(0)
  const wasHiddenRef = useRef(true)
  const showAnimDone = useRef(false)
  const [overlayData, setOverlayData] = useState<OverlayData | null>(null)
  const [searchId, setSearchId] = useState(0)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [gameBounds, setGameBounds] = useState<{ gameWidth: number; gameHeight: number; sidebarWidth: number } | null>(
    null,
  )
  const [cursorSide, setCursorSide] = useState<'left' | 'right'>('right')
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null>(null)
  // Set while a titlebar drag is in flight; called to tear it down if the overlay
  // hides (ESC/hotkey) before the user releases the mouse — otherwise the snap
  // ghost stays painted at the mount point after the panel disappears.
  const cancelDragRef = useRef<(() => void) | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const sisterRef = useRef<HTMLDivElement>(null)
  const tierSisterRef = useRef<HTMLDivElement>(null)
  const [tierSisterOpen, setTierSisterOpen] = useState(false)

  // Lifted breakpoint selection -- persists across tier-move refreshes
  const [selectedBpIndex, setSelectedBpIndex] = useState<number | null>(null)
  const [selectedQualityBpIndex, setSelectedQualityBpIndex] = useState<number | null>(null)
  const [selectedStrandBpIndex, setSelectedStrandBpIndex] = useState<number | null>(null)
  const prevItemKey = useRef<string>('')
  const priceCheckPending = useRef(false)
  const auditPending = useRef(false)
  const filterHotkeyPending = useRef(false)
  // Set when a click inside the tier sister fires lookup-base-type. Consumed by
  // the next overlay-data arrival so that drill-down synth items don't invalidate
  // the tier sister freeze (real hotkey arrivals will, since they leave it false).
  const drillDownPendingRef = useRef(false)
  const externalLinkPendingRef = useRef<ExternalLinkTarget | null>(null)
  const externalLinkPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirror of poeVersion state for IPC listeners that capture a stale closure.
  const poeVersionRef = useRef<1 | 2 | null>(null)
  const [auditBlockIndex, setAuditBlockIndex] = useState<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // PoE version detection. `features` is the single source of truth for UI
  // divergence between PoE1 and PoE2 -- prefer it over branching on poeVersion.
  const [poeVersion, setPoeVersion] = useState<1 | 2 | null>(null)
  poeVersionRef.current = poeVersion
  const features = getGameFeatures(poeVersion)

  // Swap the per-version icon CDN sheet into the shared iconMap whenever the
  // version changes. In practice this fires once per process (we relaunch on
  // game switch), but gating on the effect keeps it robust to null -> version.
  // After the bundled sheet loads, merge in any runtime-harvested entries from
  // disk so icons for items we didn't ship art for show up immediately instead
  // of waiting for the next trade fetch to re-populate them.
  useEffect(() => {
    if (!poeVersion) return
    initIconMap(poeVersion)
    initUniquesByBase(poeVersion)
    initItemClassMaps(poeVersion)
    window.api.getIconCache().then(mergeIconCache)
    window.api.getManifest().then(initManifest)
    // Publish iconMap and divCardArtMap to globalThis so the plugin SDK's
    // forked ItemChip and getItemIcon can read the same live maps without
    // importing renderer-internal modules. The maps are mutated in place by
    // mergeIconCache, so this reference stays valid across cache updates.
    ;(globalThis as unknown as { __scalpel?: ScalpelGlobal }).__scalpel = {
      iconMap,
      divCardArtMap,
    }
  }, [poeVersion])

  // Live-merge newly-harvested icons as trade-fetch responses arrive so the
  // filter hero, price-check hero, and other iconMap consumers reflect new
  // base-type art without waiting for a restart.
  useEffect(() => {
    return window.api.onIconCacheUpdated(mergeIconCache)
  }, [])

  useReportInputFocus()

  // Auto-update state
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [justUpdated, setJustUpdated] = useState<string | null>(null)
  const [brickedRelease, setBrickedRelease] = useState<{ version: string; message: string | null } | null>(null)

  // Price check state
  const [priceCheckData, setPriceCheckData] = useState<{
    item: PoeItem
    priceInfo?: PriceInfo
    statFilters: Array<{
      id: string
      text: string
      value: number | null
      min: number | null
      max: number | null
      enabled: boolean
      type: string
    }>
    league: string
    chaosPerDivine?: number
    unidCandidates?: Array<{ name: string; chaosValue: number }>
  } | null>(null)

  // Transient settings banner (hotkey collisions -> red, protected PoE hotkeys -> orange)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsErrorTone, setSettingsErrorTone] = useState<'error' | 'warn'>('error')
  const settingsErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSettingsError = (msg: string, tone: 'error' | 'warn' = 'error'): void => {
    setSettingsError(msg)
    setSettingsErrorTone(tone)
    if (settingsErrorTimer.current) clearTimeout(settingsErrorTimer.current)
    const ms = tone === 'warn' ? 5000 : 3000
    settingsErrorTimer.current = setTimeout(() => setSettingsError(null), ms)
  }

  // Elevation warning
  const [needsElevation, setNeedsElevation] = useState(false)

  // Online filter update tracking
  const [updatedOnlineFilters, setUpdatedOnlineFilters] = useState<Set<string>>(new Set())
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updatingFilter, setUpdatingFilter] = useState(false)
  const [mergeMessage, setMergeMessage] = useState<string | null>(null)

  const currentZone = useCurrentZone()

  const [pluginTabs, setPluginTabs] = useState<RegisteredTab[]>([])

  const onSubscribeCurrentItem = useCallback(
    (h: (i: PoeItem) => void): (() => void) => window.api.onOverlayData((d) => h(d.item)),
    [],
  )
  const onSubscribeCurrentZone = useCallback(
    (h: (z: import('../../../shared/types').Zone) => void): (() => void) =>
      window.api.onZoneChanged((z) => {
        if (z !== null) h(z)
      }),
    [],
  )
  const onSubscribeLeagueChange = useCallback(
    (h: (l: string) => void): (() => void) =>
      window.api.onSettingUpdated((k, v) => {
        if (k === 'league' && typeof v === 'string') h(v)
      }),
    [],
  )

  const [brokenPlugins, setBrokenPlugins] = useState<BrokenPlugin[]>([])

  const handlePluginError = useCallback((id: string, err: Error): void => {
    setBrokenPlugins((prev) => {
      if (prev.find((p) => p.id === id)) return prev
      return [...prev, { id, message: err.message }]
    })
    if (window.__SCALPEL_DEBUG_LOG) {
      console.warn('[plugin error]', id, err)
    }
  }, [])

  const dismissBrokenPlugin = useCallback((id: string): void => {
    setBrokenPlugins((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleToggleZoneAreaLevel = useCallback((next: boolean) => {
    setSettings((prev) => (prev ? { ...prev, useCurrentZoneAreaLevel: next } : prev))
    window.api.setSetting('useCurrentZoneAreaLevel', next)
  }, [])

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    // Pull initial overlay state that may have been set before renderer loaded
    window.api.getOverlayState().then((state) => {
      if (state.poeVersion) setPoeVersion(state.poeVersion)
      if (state.gameBounds) setGameBounds(state.gameBounds)
    })
    // Pull cached updater state so a late-mount overlay sees anything that already fired.
    window.api.getUpdateState().then((s) => {
      if (s.updateVersion) setUpdateVersion(s.updateVersion)
      if (s.updateReady) setUpdateReady(true)
      if (s.brickedRelease) setBrickedRelease(s.brickedRelease)
    })
    const unsubElevation = window.api.onElevationHint(() => setNeedsElevation(true))

    const unsubs = [
      window.api.onPoeVersion((v) => setPoeVersion(v)),
      window.api.onUpdateAvailable((version) => setUpdateVersion(version)),
      window.api.onBrickedRelease((info) => setBrickedRelease(info)),
      window.api.onUpdateDownloadProgress((percent) => setUpdateProgress(percent)),
      window.api.onUpdateDownloaded(() => {
        setUpdateProgress(null)
        setUpdateReady(true)
      }),
      window.api.onUpdateRescinded(() => {
        setUpdateVersion(null)
        setUpdateProgress(null)
        setUpdateReady(false)
      }),
      window.api.onUpdateApplied((version, savedState) => {
        setJustUpdated(version)
        setTimeout(() => setJustUpdated(null), 4000)
        if (savedState) {
          // Restore overlay data and price check data
          if (savedState.overlayData) setOverlayData(savedState.overlayData as OverlayData)
          if (savedState.priceCheckData) setPriceCheckData(savedState.priceCheckData as typeof priceCheckData)
          // Restore the view
          if (savedState.view && savedState.view !== 'idle') {
            setView(savedState.view as View)
          }
        }
      }),
      window.api.onCursorSide((side) => {
        // While the panel is dragged away from either edge, ignore cursor-side flips
        // (basePanelLeft follows cursorSide, so flipping would yank the floating panel
        // between the two mount X positions when hotkeying between stash and inventory).
        if (dragOffsetRef.current.x !== 0 || dragOffsetRef.current.y !== 0) return
        setCursorSide(side)
      }),
      window.api.onOverlayData((data) => {
        // Tier-sister freeze: a drill-down click set the flag, so leave the freeze
        // alone (the synth item often has empty baseTypes). Anything else (real
        // hotkey, search combobox, etc.) is a genuine new arrival -- drop the
        // freeze so the next render re-captures from the new tier's live data.
        const wasDrillDown = drillDownPendingRef.current
        drillDownPendingRef.current = false
        if (!wasDrillDown) frozenTierSisterDataRef.current = null

        setOverlayData(data)
        setSearchId((id) => id + 1)
        setNeedsElevation(false)

        // Only reset breakpoint selection when a genuinely different item arrives
        const itemKey = `${data.item.name}|${data.item.baseType}`
        const isNewItem = itemKey !== prevItemKey.current
        if (isNewItem) {
          setSelectedBpIndex(null)
          setSelectedQualityBpIndex(null)
          setAuditBlockIndex(null)
          prevItemKey.current = itemKey
        }

        if (auditPending.current) {
          auditPending.current = false
          setView('audit')
        } else if (priceCheckPending.current) {
          priceCheckPending.current = false
        } else if (filterHotkeyPending.current) {
          // User pressed the filter hotkey: always jump to item view, even if the same
          // item was already loaded on another tab (e.g. pricecheck).
          filterHotkeyPending.current = false
          setView('item')
        } else if (isNewItem) {
          // New item from hotkey: always go to item view
          setView('item')
        } else {
          // Same item re-shown (e.g. after zone transition, or re-picking the same row
          // from the search combobox): re-show if hidden, and also leave the notice views
          // ('no-item', 'no-filter') since the user explicitly surfaced an item.
          setView((prev) => (prev === 'idle' || prev === 'no-item' || prev === 'no-filter' ? 'item' : prev))
        }

        // Wiki / PoEDB app-macro: hotkey set this flag, then triggered a price-check.
        // Now that we have item context, open the requested target in the system browser.
        const pending = externalLinkPendingRef.current
        if (pending) {
          externalLinkPendingRef.current = null
          if (externalLinkPendingTimerRef.current) clearTimeout(externalLinkPendingTimerRef.current)
          const v = poeVersionRef.current
          if (data.item?.name && v) window.api.openExternal(externalLinkUrl(pending, data.item, v))
        }
      }),
      window.api.onOpenLinkPending((target) => {
        externalLinkPendingRef.current = target
        // TTL guard: drop the flag if no overlay-data arrives in time so a failed
        // price-check doesn't open the link on the user's next unrelated price-check.
        if (externalLinkPendingTimerRef.current) clearTimeout(externalLinkPendingTimerRef.current)
        externalLinkPendingTimerRef.current = setTimeout(() => {
          externalLinkPendingRef.current = null
          externalLinkPendingTimerRef.current = null
        }, EXTERNAL_LINK_PENDING_TTL_MS)
      }),
      window.api.onPriceCheck((data) => {
        setPriceCheckData({ ...data, _key: Date.now() } as typeof data & { _key: number })
      }),
      window.api.onFilterHotkeyOpen(() => {
        filterHotkeyPending.current = true
      }),
      window.api.onPriceCheckOpen(() => {
        priceCheckPending.current = true
        // Keep the previous priceCheckData mounted until the new data arrives -- nulling
        // here unmounts the sister mid-drill-down, which re-plays its slide animation and
        // loses its internal entry state. Showing one frame of stale data is cheaper than
        // losing the "stay open across clicks" behavior users expect.
        setView('pricecheck')
      }),
      window.api.onNoFilterLoaded(() => setView('no-filter')),
      window.api.onNoItemInClipboard(() => setView('no-item')),
      window.api.onOverlayHide(() => {
        cancelDragRef.current?.()
        setClosing(true)
        setTimeout(() => {
          setClosing(false)
          setView('idle')
        }, 150)
      }),
      window.api.onOpenSettings(() => setView('setup')),
      window.api.onOpenView((v, tab) => {
        if (v === 'audit') {
          auditPending.current = true
        } else {
          const valid = ['setup', 'dust', 'divcards', 'regex'] as const
          if (!valid.includes(v as (typeof valid)[number])) return
          // Don't reopen tabs that the active game has disabled (e.g. regex on PoE2).
          const active = getGameFeatures(settings?.poeVersion ?? 1)
          if (v === 'dust' && !active.dustExplorer) return
          if (v === 'divcards' && !active.divCards) return
          if (v === 'regex' && !active.regexTool) return
          setView(v as View)
          // Optional second arg: the settings sub-tab to focus. Bump a
          // counter alongside so re-opens to the same tab still re-trigger
          // the switch in SettingsPanel.
          if (v === 'setup' && tab) setSettingsTabRequest((prev) => ({ tab, n: (prev?.n ?? 0) + 1 }))
        }
      }),
      window.api.onGameBounds((bounds) => setGameBounds(bounds)),
      window.api.onSkipAnimation(() => {
        if (animRef.current) animRef.current.style.animation = 'none'
      }),
      window.api.onSettingUpdated((key, value) => {
        setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
      }),
      window.api.onOnlineFilterChanged((changed) => {
        setUpdatedOnlineFilters((prev) => {
          const next = new Set(prev)
          for (const c of changed) next.add(c.name)
          return next
        })
      }),
    ]

    return () => {
      for (const unsub of unsubs) unsub()
      unsubElevation()
      if (externalLinkPendingTimerRef.current) clearTimeout(externalLinkPendingTimerRef.current)
    }
  }, [])

  // Scroll content to top when switching to item view
  useEffect(() => {
    if (view === 'item' && contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [view])

  // Lock interactive mode while native <select> dropdowns are open so click-through
  // doesn't activate when the dropdown extends past the panel bounds
  useEffect(() => {
    const onFocus = (e: FocusEvent): void => {
      if (e.target instanceof HTMLSelectElement) window.api.lockInteractive()
    }
    const onBlur = (e: FocusEvent): void => {
      if (e.target instanceof HTMLSelectElement) window.api.unlockInteractive()
    }
    document.addEventListener('focus', onFocus, true)
    document.addEventListener('blur', onBlur, true)
    return () => {
      document.removeEventListener('focus', onFocus, true)
      document.removeEventListener('blur', onBlur, true)
    }
  }, [])

  // No-op: onboarding is handled by the app window, not the overlay

  const close = (): void => {
    cancelDragRef.current?.()
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setView('idle')
    }, 150)
    window.api.closeOverlay()
  }

  // Mount positions for both sides
  const leftMountX = gameBounds ? gameBounds.sidebarWidth - 1 : 0
  const rightMountX = gameBounds ? gameBounds.gameWidth - gameBounds.sidebarWidth - PANEL_WIDTH + 1 : 0
  const basePanelLeft = gameBounds ? (cursorSide === 'left' ? leftMountX : rightMountX) : undefined

  const skipAnimRef = useRef(false)
  const isMounted = dragOffset.x === 0 && dragOffset.y === 0

  // Snap target during drag
  const [snapTarget, setSnapTarget] = useState<'left' | 'right' | null>(null)
  const snapTargetRef = useRef<'left' | 'right' | null>(null)
  snapTargetRef.current = snapTarget
  const isHidden = view === 'idle' && !closing && !justUpdated

  // Increment showCount only on hidden -> visible transition
  if (wasHiddenRef.current && !isHidden) {
    showCountRef.current++
    showAnimDone.current = false
  }
  wasHiddenRef.current = isHidden

  const panelRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<HTMLDivElement>(null)

  // Report the panel's actual visual bounding rect to the main process for click-through
  // hit testing. Using getBoundingClientRect on the wrapper (which has the CSS transform)
  // gives us the true visual position, accounting for scale, drag offset, and side.
  //
  // Polled on a short interval rather than one-shot useEffect because:
  // - CSS animations (slide-in) change the rect over time
  // - getBoundingClientRect during animation returns the mid-animation position
  // - One-shot after state change would capture the animation start, not end
  useEffect(() => {
    if (isHidden) {
      window.api.reportPanelRect([])
      return
    }
    const tick = (): void => {
      if (!wrapperRef.current) return
      const rects: Array<{ left: number; top: number; width: number; height: number }> = []
      const main = wrapperRef.current.getBoundingClientRect()
      rects.push({ left: main.left, top: main.top, width: main.width, height: main.height })
      // Report the sister rect separately (not as a union) so the empty space under a
      // shorter sister stays click-through to PoE.
      const sister = sisterRef.current?.getBoundingClientRect()
      if (sister && sister.width > 0 && sister.height > 0) {
        rects.push({ left: sister.left, top: sister.top, width: sister.width, height: sister.height })
      }
      const tierSister = tierSisterRef.current?.getBoundingClientRect()
      if (tierSister && tierSister.width > 0 && tierSister.height > 0) {
        rects.push({
          left: tierSister.left,
          top: tierSister.top,
          width: tierSister.width,
          height: tierSister.height,
        })
      }
      window.api.reportPanelRect(rects)
    }
    tick()
    const interval = setInterval(tick, 100)
    return () => clearInterval(interval)
  }, [isHidden])

  // Suppress slide-in animation when cursorSide changes due to a snap
  useLayoutEffect(() => {
    if (skipAnimRef.current && animRef.current) {
      animRef.current.style.animation = 'none'
      skipAnimRef.current = false
    }
  }, [cursorSide, dragOffset])

  const handleTitleBarMouseDown = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: dragOffsetRef.current.x,
      origOffsetY: dragOffsetRef.current.y,
    }
    document.body.classList.add('dragging')
    const SNAP_RANGE = 60
    const scaleStr = settings?.overlayScale && settings.overlayScale !== 1 ? ` scale(${settings.overlayScale})` : ''
    const setTranslate = (el: HTMLElement | null, x: number, y: number): void => {
      if (!el) return
      el.style.transform = `translate(${x}px, ${y}px)${scaleStr}`
    }
    const resetToIdentity = (el: HTMLElement | null): void => {
      if (!el) return
      el.style.transition = ''
      el.style.transform = `translate(0px, 0px)${scaleStr}`
    }
    let dragStarted = false
    const onMove = (ev: MouseEvent): void => {
      if (!dragStarted) {
        dragStarted = true
        panelRef.current?.classList.add('panel-unmounted')
      }
      if (!dragging.current || !gameBounds) return
      const nx = dragging.current.origOffsetX + ev.clientX - dragging.current.startX
      const ny = dragging.current.origOffsetY + ev.clientY - dragging.current.startY
      dragOffsetRef.current = { x: nx, y: ny }
      setTranslate(wrapperRef.current, nx, ny)
      // Follow the drag live so the sister overlay stays glued to the main panel.
      // sister vs. tier-sister are mounted under different views and are never
      // both present at once, but applying to both is safe (setTranslate null-guards).
      setTranslate(sisterRef.current, nx, ny)
      setTranslate(tierSisterRef.current, nx, ny)
      // Check snap proximity to mount points
      const currentLeft = (basePanelLeft ?? 0) + nx
      const currentTop = PANEL_TOP + ny
      const leftDist = Math.hypot(currentLeft - leftMountX, currentTop - PANEL_TOP)
      const rightDist = Math.hypot(currentLeft - rightMountX, currentTop - PANEL_TOP)
      if (leftDist < SNAP_RANGE) setSnapTarget('left')
      else if (rightDist < SNAP_RANGE) setSnapTarget('right')
      else setSnapTarget(null)
    }
    const cancel = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragging.current = null
      document.body.classList.remove('dragging')
      panelRef.current?.classList.remove('panel-unmounted')
      setSnapTarget(null)
      resetToIdentity(wrapperRef.current)
      resetToIdentity(sisterRef.current)
      resetToIdentity(tierSisterRef.current)
      dragOffsetRef.current = { x: 0, y: 0 }
      setDragOffset({ x: 0, y: 0 })
      cancelDragRef.current = null
    }
    cancelDragRef.current = cancel
    const onUp = (): void => {
      dragging.current = null
      document.body.classList.remove('dragging')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cancelDragRef.current = null
      // Snap to target if in range
      const snap = snapTargetRef.current
      if (snap && wrapperRef.current) {
        const targetMountX = snap === 'left' ? leftMountX : rightMountX
        const targetDx = targetMountX - (basePanelLeft ?? 0)
        const el = wrapperRef.current
        // Whichever sister is currently mounted (price-check or tier) rides the
        // same transition so it stays glued to the main panel during snap.
        const sEls = [sisterRef.current, tierSisterRef.current]
        el.style.transition = 'transform 0.2s ease-out'
        setTranslate(el, targetDx, 0)
        for (const sEl of sEls) {
          if (!sEl) continue
          sEl.style.transition = 'transform 0.2s ease-out'
          setTranslate(sEl, targetDx, 0)
        }
        const onEnd = (): void => {
          el.removeEventListener('transitionend', onEnd)
          // Set final position directly on the DOM - React may skip the
          // transform update if the value matches what it last rendered
          el.style.left = `${targetMountX}px`
          resetToIdentity(el)
          for (const sEl of sEls) resetToIdentity(sEl)
          dragOffsetRef.current = { x: 0, y: 0 }
          setDragOffset({ x: 0, y: 0 })
          panelRef.current?.classList.remove('panel-unmounted')
          if (snap !== cursorSide) {
            setCursorSide(snap)
          }
          setSnapTarget(null)
          skipAnimRef.current = true
        }
        el.addEventListener('transitionend', onEnd)
      } else {
        panelRef.current?.classList.remove('panel-unmounted')
        setDragOffset({ ...dragOffsetRef.current })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const isFullHeightView =
    view === 'dust' ||
    view === 'divcards' ||
    view === 'pricecheck' ||
    view === 'item' ||
    view === 'regex' ||
    view === 'audit' ||
    view.startsWith('plugin:')

  // Sister overlay pinned immediately adjacent to the main panel on the opposite side
  // of where the main panel is mounted.
  const SISTER_WIDTH = 130
  const SISTER_GAP = 6
  // Line the sister top with the main panel's content area: 30px nav row + 10px vertical
  // padding + 1px border ~= 51px below the panel top.
  const SISTER_NAV_OFFSET = 51
  // Panel and sister both scale inward (toward each other) from opposite outer edges, so
  // overlayScale > 1 eats into the gap from both sides. Add (S-1)*(PANEL+SISTER) worth of
  // CSS px so the post-scale visible gap stays at SISTER_GAP regardless of scale.
  const overlayScale = settings?.overlayScale ?? 1
  const sisterScaleOffset = (overlayScale - 1) * (PANEL_WIDTH + SISTER_WIDTH)
  const sisterLeft =
    cursorSide === 'left'
      ? (basePanelLeft ?? 0) + PANEL_WIDTH + SISTER_GAP + sisterScaleOffset
      : (basePanelLeft ?? 0) - SISTER_WIDTH - SISTER_GAP - sisterScaleOffset
  // Bound the sister to the game window the same way the main panel is, minus the
  // SISTER_NAV_OFFSET it already sits below. Scale divides out so the post-scale
  // visual height fits within the game bounds.
  const sisterMaxHeight = gameBounds
    ? (gameBounds.gameHeight - PANEL_TOP * 2 - 23 - SISTER_NAV_OFFSET) / (settings?.overlayScale ?? 1)
    : undefined

  // Compute baseTypes for the tier sister on the filter page. Uses the shared
  // getActiveMatch so the sister's items match whatever tier FilterPanel is showing.
  const liveTierSisterData = ((): {
    baseTypes: string[]
    itemClass: string
    tier: string
    uniqueTier: boolean
  } | null => {
    if (!overlayData) return null
    const { match } = getActiveMatch(overlayData, selectedBpIndex, selectedQualityBpIndex, selectedStrandBpIndex)
    if (!match) return null
    const baseTypes = match.block.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values)
    const uniqueTier = match.block.conditions.some((c) => c.type === 'Rarity' && c.values.some((v) => v === 'Unique'))
    return {
      baseTypes,
      itemClass: overlayData.item.itemClass,
      tier: match.block.tierTag?.tier ?? '',
      uniqueTier,
    }
  })()

  // Freeze the tier sister's data so drill-down clicks don't visually drop the
  // sister. Clicking a row fires lookup-base-type, which builds a synthesised
  // item that can fail conditions on the original tier block (especially in
  // PoE2 -- the synth lacks itemLevel/areaLevel/sockets context), and re-
  // deriving from the live overlay would briefly land in a fallthrough block
  // with empty baseTypes. The drill-down click sets drillDownPendingRef so the
  // next overlay-data arrival keeps the freeze; real arrivals (hotkey, search
  // combobox, etc.) drop the freeze and let the next render re-capture from
  // the new tier's live data.
  const frozenTierSisterDataRef = useRef<typeof liveTierSisterData>(null)
  if (tierSisterOpen && !frozenTierSisterDataRef.current && liveTierSisterData) {
    frozenTierSisterDataRef.current = liveTierSisterData
  }
  if (!tierSisterOpen) {
    frozenTierSisterDataRef.current = null
  }
  const tierSisterData = frozenTierSisterDataRef.current ?? liveTierSisterData

  // Build the click handler for a Wiki/PoEDB button. Returns undefined when
  // there's no item context or no known game version so the parent component
  // hides the button. Wiki and PoEDB both have PoE1 and PoE2 sites.
  const externalLinkHandler = (target: ExternalLinkTarget, item: PoeItem | undefined): (() => void) | undefined => {
    if (!item || !poeVersion) return undefined
    return () => window.api.openExternal(externalLinkUrl(target, item, poeVersion))
  }

  // poe.ninja deep-link handler. Returns undefined when there's no item, no league
  // resolved, the item type isn't priced on ninja (covered by ninjaLinkUrl), or we
  // don't have a ninja price entry for this item -- ninja's PoE2 catalogue is
  // incomplete and items absent from it 404 on the deep link.
  const ninjaLinkHandler = (item: PoeItem | undefined, priceInfo: PriceInfo | undefined): (() => void) | undefined => {
    if (!item || !poeVersion || !settings?.league || !priceInfo) return undefined
    const leagueSlugMap = getManifest().ninjaLeagues[poeVersion === 1 ? 'poe1' : 'poe2']
    const url = ninjaLinkUrl(item, poeVersion, settings.league, leagueSlugMap, priceInfo)
    if (!url) return undefined
    return () => window.api.openExternal(url)
  }

  return (
    <PoeVersionProvider version={poeVersion}>
      {view === 'item' && tierSisterOpen && overlayData && !isHidden && (
        <TierItemsSister
          ref={tierSisterRef}
          baseTypes={tierSisterData?.baseTypes ?? []}
          itemClass={tierSisterData?.itemClass ?? overlayData.item.itemClass}
          currentBaseType={overlayData.item.baseType}
          currentRarity={overlayData.item.rarity}
          league={settings?.league ?? ''}
          uniqueTier={tierSisterData?.uniqueTier}
          left={sisterLeft}
          top={PANEL_TOP + SISTER_NAV_OFFSET}
          width={SISTER_WIDTH}
          dragOffset={dragOffset}
          scale={settings?.overlayScale}
          scaleOrigin={cursorSide === 'left' ? 'top right' : 'top left'}
          maxHeight={sisterMaxHeight}
          onDrillDown={() => {
            drillDownPendingRef.current = true
          }}
        />
      )}
      {view === 'pricecheck' && priceCheckData && !isHidden && (
        <SisterOverlay
          ref={sisterRef}
          itemName={priceCheckData.item.name}
          league={priceCheckData.league}
          chaosPerDivine={priceCheckData.chaosPerDivine}
          left={sisterLeft}
          top={PANEL_TOP + SISTER_NAV_OFFSET}
          width={SISTER_WIDTH}
          dragOffset={dragOffset}
          scale={settings?.overlayScale}
          scaleOrigin={cursorSide === 'left' ? 'top right' : 'top left'}
          maxHeight={sisterMaxHeight}
        />
      )}
      <SnapGhosts
        leftMountX={leftMountX}
        rightMountX={rightMountX}
        panelTop={PANEL_TOP}
        panelWidth={PANEL_WIDTH}
        panelHeight={panelRef.current?.offsetHeight ?? 0}
        snapTarget={snapTarget}
        overlayScale={settings?.overlayScale}
      />
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          top: PANEL_TOP,
          left: basePanelLeft ?? 0,
          width: PANEL_WIDTH,
          display: isHidden ? 'none' : 'block',
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)${settings?.overlayScale && settings.overlayScale !== 1 ? ` scale(${settings.overlayScale})` : ''}`,
          transformOrigin: cursorSide === 'left' ? 'top left' : 'top right',
        }}
      >
        <div
          ref={animRef}
          key={isHidden ? 'hidden' : `show-${showCountRef.current}`}
          style={{
            animation:
              isHidden || showAnimDone.current || skipAnimRef.current
                ? 'none'
                : closing
                  ? isMounted
                    ? cursorSide === 'left'
                      ? 'panel-slide-out-left 0.15s ease-in both'
                      : 'panel-slide-out 0.15s ease-in both'
                    : 'panel-fade-out 0.15s ease-in both'
                  : isMounted
                    ? cursorSide === 'left'
                      ? 'panel-slide-in-left 0.2s ease-out both'
                      : 'panel-slide-in 0.2s ease-out both'
                    : 'panel-fade-in 0.15s ease-out both',
            width: PANEL_WIDTH,
          }}
          onMouseEnter={() => {
            showAnimDone.current = true
            if (animRef.current) animRef.current.style.animation = 'none'
          }}
        >
          <div
            ref={panelRef}
            className="bg-bg flex flex-col overflow-hidden border-t border-b border-border"
            style={{
              width: PANEL_WIDTH,
              maxHeight: gameBounds
                ? (gameBounds.gameHeight - PANEL_TOP * 2 - 23) / (settings?.overlayScale ?? 1)
                : 'calc(100vh - 16px)',
              borderRadius: isMounted ? (cursorSide === 'left' ? '0 10px 10px 0' : '10px 0 0 10px') : '10px',
              borderLeft: isMounted && cursorSide === 'left' ? 'none' : '1px solid var(--border)',
              borderRight: isMounted && cursorSide === 'right' ? 'none' : '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}
          >
            <TitleBar
              view={view}
              overlayData={overlayData}
              poeVersion={poeVersion}
              features={features}
              hasPriceCheckData={!!priceCheckData}
              hiddenTabs={new Set((settings?.hiddenTabs ?? []).filter(isHideableTabKey))}
              pluginTabs={pluginTabs.map((t) => ({ pluginId: t.pluginId, label: t.label, icon: t.icon }))}
              onSetView={setView}
              onClose={close}
              onMouseDown={handleTitleBarMouseDown}
            />

            <UpdateBanner
              updateVersion={updateVersion}
              updateProgress={updateProgress}
              updateReady={updateReady}
              justUpdated={justUpdated}
              needsElevation={needsElevation}
              brickedRelease={brickedRelease}
              view={view}
              overlayData={overlayData}
              priceCheckData={priceCheckData}
              onSaveAndInstall={(state) => {
                window.api.saveOverlayState(state)
                window.api.installUpdate()
              }}
              onDownloadUpdate={() => {
                setUpdateProgress(0)
                window.api.downloadUpdate()
              }}
            />

            {view === 'item' && settings?.filterPath && (
              <FilterInfoBanner
                filterPath={settings.filterPath}
                updatedOnlineFilters={updatedOnlineFilters}
                checkingUpdate={checkingUpdate}
                updatingFilter={updatingFilter}
                mergeMessage={mergeMessage}
                onQuickUpdate={() => window.api.quickUpdateFilter()}
                onCheckForUpdate={async () => {
                  await window.api.checkForOnlineUpdate()
                }}
                onFilterUpdated={(activeFile) => {
                  setUpdatedOnlineFilters((prev) => {
                    const next = new Set(prev)
                    for (const name of prev) {
                      if (name.replace(/[<>:"/\\|?*]/g, '_') + '-local' === activeFile) next.delete(name)
                    }
                    return next
                  })
                }}
                onMergeMessage={setMergeMessage}
                onSetUpdatingFilter={setUpdatingFilter}
                onSetCheckingUpdate={setCheckingUpdate}
              />
            )}

            {/* Content */}
            <div
              ref={contentRef}
              className={
                (isFullHeightView ? 'flex flex-col flex-1 overflow-hidden' : 'flex-1 overflow-y-auto p-3') + ' relative'
              }
            >
              <PluginErrorBanner broken={brokenPlugins} onDismiss={dismissBrokenPlugin} />
              {/* Settings error banner (hotkey collisions etc) */}
              <ErrorBanner message={settingsError} tone={settingsErrorTone} />
              {view === 'setup' && settings && (
                <SettingsPanel
                  settings={settings}
                  onSettingsChange={(s) => setSettings(s)}
                  mode="overlay"
                  onDone={() => setView('idle')}
                  currentItem={overlayData?.item}
                  onError={showSettingsError}
                  tabRequest={settingsTabRequest}
                  onOnlineFilterUpdated={(name) =>
                    setUpdatedOnlineFilters((prev) => {
                      const next = new Set(prev)
                      next.delete(name)
                      return next
                    })
                  }
                />
              )}
              {view === 'no-filter' && (
                <Notice icon="⚠" title="No filter loaded" body="Click ⚙ to select your .filter file." />
              )}
              {view === 'no-item' && (
                <>
                  <Notice
                    icon={<Clipboard size={32} {...IP} />}
                    title="No item in clipboard"
                    body={`Hover an item in PoE and press ${prettyHotkey(settings?.hotkey) || 'Ctrl+Shift+F'}.`}
                  />
                  <div className="px-6 pb-6">
                    <ItemSearchCombobox />
                  </div>
                </>
              )}
              {view === 'item' && overlayData && (
                <FilterPanel
                  key={searchId}
                  data={overlayData}
                  selectedBpIndex={selectedBpIndex}
                  onSelectBp={setSelectedBpIndex}
                  selectedQualityBpIndex={selectedQualityBpIndex}
                  onSelectQualityBp={setSelectedQualityBpIndex}
                  selectedStrandBpIndex={selectedStrandBpIndex}
                  onSelectStrandBp={setSelectedStrandBpIndex}
                  onClose={close}
                  onOpenAudit={() => {
                    setAuditBlockIndex(null)
                    setView('audit')
                  }}
                  onOpenTools={features.socketRecolor ? () => setView('tools') : undefined}
                  onOpenDustExplore={features.dustExplorer ? () => setView('dust') : undefined}
                  onOpenDivExplore={features.divCards ? () => setView('divcards') : undefined}
                  onOpenWiki={externalLinkHandler('wiki', overlayData?.item)}
                  onOpenPoeDb={externalLinkHandler('poedb', overlayData?.item)}
                  onOpenNinja={ninjaLinkHandler(overlayData?.item, overlayData?.priceInfo)}
                  tierSisterOpen={tierSisterOpen}
                  onToggleTierSister={() => setTierSisterOpen((v) => !v)}
                  tierSisterSide={cursorSide === 'left' ? 'right' : 'left'}
                  currentZone={currentZone}
                  useCurrentZoneAreaLevel={settings?.useCurrentZoneAreaLevel ?? false}
                  onToggleZoneAreaLevel={handleToggleZoneAreaLevel}
                />
              )}
              {view === 'tools' && overlayData && features.socketRecolor && (
                <SocketRecolor item={overlayData.item} priceInfo={overlayData.priceInfo} />
              )}
              {view === 'pricecheck' &&
                (priceCheckData ? (
                  <PriceCheck
                    key={(priceCheckData as Record<string, unknown>)._key as number}
                    item={priceCheckData.item}
                    priceInfo={priceCheckData.priceInfo}
                    statFilters={priceCheckData.statFilters}
                    league={priceCheckData.league}
                    poeVersion={poeVersion ?? 1}
                    chaosPerDivine={priceCheckData.chaosPerDivine}
                    unidCandidates={priceCheckData.unidCandidates}
                    onClose={close}
                    onOpenWiki={externalLinkHandler('wiki', priceCheckData?.item)}
                    onOpenPoeDb={externalLinkHandler('poedb', priceCheckData?.item)}
                    onOpenNinja={ninjaLinkHandler(priceCheckData?.item, priceCheckData?.priceInfo)}
                  />
                ) : (
                  <PriceCheckSkeleton />
                ))}
              {features.dustExplorer && (
                <div className="flex-col flex-1 min-h-0" style={{ display: view === 'dust' ? 'flex' : 'none' }}>
                  <DustExplorer onSelectItem={() => setView('item')} onPriceCheckItem={() => setView('pricecheck')} />
                </div>
              )}
              {features.divCards && (
                <div className="flex-col flex-1 min-h-0" style={{ display: view === 'divcards' ? 'flex' : 'none' }}>
                  <DivCardExplorer onSelectItem={() => setView('item')} />
                </div>
              )}
              {features.regexTool && poeVersion !== null && (
                // Gate on poeVersion being resolved -- RegexTool's children read
                // localStorage in their useState initializers, and those keys are
                // namespaced by game version. Mounting before poeVersion arrives
                // hydrates with the PoE1 default, locking in the wrong namespace.
                <div className="flex-col flex-1 min-h-0" style={{ display: view === 'regex' ? 'flex' : 'none' }}>
                  <RegexTool />
                </div>
              )}
              {view === 'audit' && overlayData && overlayData.matches.length > 0 && (
                <AuditView
                  overlayData={overlayData}
                  selectedBpIndex={selectedBpIndex}
                  selectedQualityBpIndex={selectedQualityBpIndex}
                  selectedStrandBpIndex={selectedStrandBpIndex}
                  auditBlockIndex={auditBlockIndex}
                  onSetAuditBlockIndex={setAuditBlockIndex}
                  onSelectItem={() => setView('item')}
                />
              )}
              {view.startsWith('plugin:') && (
                <PluginTabHost
                  pluginTabs={pluginTabs}
                  activeId={view.slice('plugin:'.length)}
                  onPluginError={handlePluginError}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <PluginHost
        ready={poeVersion !== null}
        poeVersion={poeVersion ?? 1}
        league={settings?.league ?? ''}
        currentItem={overlayData?.item ?? null}
        currentZone={currentZone}
        onSubscribeCurrentItem={onSubscribeCurrentItem}
        onSubscribeCurrentZone={onSubscribeCurrentZone}
        onSubscribeLeagueChange={onSubscribeLeagueChange}
        onOpenExternal={(url) => window.api.openExternal(url)}
        onTabsChange={setPluginTabs}
        onOpenPluginTab={(pluginId) => {
          setView(`plugin:${pluginId}` as View)
          void window.api.pluginShowOverlay()
        }}
        onCopyAndEvaluateItem={() => window.api.pluginTriggerMainHotkey()}
        onPluginError={handlePluginError}
        onPluginUnloaded={(pluginId) => {
          if (view === `plugin:${pluginId}`) setView('idle')
        }}
      />
    </PoeVersionProvider>
  )
}
