import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppSettings, OverlayData, PoeItem } from '../../../shared/types'
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
import { IP } from '../shared/constants'
import { prettyHotkey } from '../components/settings'

type View =
  | 'idle'
  | 'item'
  | 'no-filter'
  | 'no-item'
  | 'setup'
  | 'audit'
  | 'tools'
  | 'dust'
  | 'divcards'
  | 'pricecheck'
  | 'regex'

const PANEL_WIDTH = 540
const PANEL_TOP = 8

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('idle')
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
  const [auditBlockIndex, setAuditBlockIndex] = useState<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // PoE version detection
  const [poeVersion, setPoeVersion] = useState<1 | 2 | null>(null)

  // Auto-update state
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [justUpdated, setJustUpdated] = useState<string | null>(null)
  const [brickedRelease, setBrickedRelease] = useState<{ version: string; message: string | null } | null>(null)

  // Price check state
  const [priceCheckData, setPriceCheckData] = useState<{
    item: PoeItem
    priceInfo?: import('../../../shared/types').PriceInfo
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
        setClosing(true)
        setTimeout(() => {
          setClosing(false)
          setView('idle')
        }, 150)
      }),
      window.api.onOpenSettings(() => setView('setup')),
      window.api.onOpenView((v) => {
        if (v === 'audit') {
          auditPending.current = true
        } else {
          const valid = ['setup', 'dust', 'divcards', 'regex'] as const
          if (valid.includes(v as (typeof valid)[number])) setView(v as View)
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
      unsubs.forEach((fn) => fn())
      unsubElevation()
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
      const scaleStr = settings?.overlayScale && settings.overlayScale !== 1 ? ` scale(${settings.overlayScale})` : ''
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translate(${nx}px, ${ny}px)${scaleStr}`
      }
      // Follow the drag live so the sister overlay stays glued to the main panel.
      if (sisterRef.current) {
        sisterRef.current.style.transform = `translate(${nx}px, ${ny}px)${scaleStr}`
      }
      // Check snap proximity to mount points
      const currentLeft = (basePanelLeft ?? 0) + nx
      const currentTop = PANEL_TOP + ny
      const leftDist = Math.hypot(currentLeft - leftMountX, currentTop - PANEL_TOP)
      const rightDist = Math.hypot(currentLeft - rightMountX, currentTop - PANEL_TOP)
      if (leftDist < SNAP_RANGE) setSnapTarget('left')
      else if (rightDist < SNAP_RANGE) setSnapTarget('right')
      else setSnapTarget(null)
    }
    const onUp = (): void => {
      dragging.current = null
      document.body.classList.remove('dragging')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Snap to target if in range
      const snap = snapTargetRef.current
      if (snap && wrapperRef.current) {
        const targetMountX = snap === 'left' ? leftMountX : rightMountX
        const targetDx = targetMountX - (basePanelLeft ?? 0)
        const scaleStr = settings?.overlayScale && settings.overlayScale !== 1 ? ` scale(${settings.overlayScale})` : ''
        const el = wrapperRef.current
        el.style.transition = 'transform 0.2s ease-out'
        el.style.transform = `translate(${targetDx}px, 0px)${scaleStr}`
        // Sister rides the same transition so it stays glued to the main panel during snap.
        const sEl = sisterRef.current
        if (sEl) {
          sEl.style.transition = 'transform 0.2s ease-out'
          sEl.style.transform = `translate(${targetDx}px, 0px)${scaleStr}`
        }
        const onEnd = (): void => {
          el.removeEventListener('transitionend', onEnd)
          el.style.transition = ''
          // Set final position directly on the DOM - React may skip the
          // transform update if the value matches what it last rendered
          el.style.left = `${targetMountX}px`
          el.style.transform = `translate(0px, 0px)${scaleStr}`
          if (sEl) {
            sEl.style.transition = ''
            sEl.style.transform = `translate(0px, 0px)${scaleStr}`
          }
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
    view === 'audit'

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
  const tierSisterData = ((): {
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

  return (
    <>
      {view === 'item' && tierSisterOpen && tierSisterData && tierSisterData.baseTypes.length > 0 && !isHidden && (
        <TierItemsSister
          ref={tierSisterRef}
          baseTypes={tierSisterData.baseTypes}
          itemClass={tierSisterData.itemClass}
          currentBaseType={overlayData?.item.baseType}
          league={settings?.league ?? ''}
          uniqueTier={tierSisterData.uniqueTier}
          left={sisterLeft}
          top={PANEL_TOP + SISTER_NAV_OFFSET}
          width={SISTER_WIDTH}
          dragOffset={dragOffset}
          scale={settings?.overlayScale}
          scaleOrigin={cursorSide === 'left' ? 'top right' : 'top left'}
          maxHeight={sisterMaxHeight}
          animKey={tierSisterData.tier}
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
              hasPriceCheckData={!!priceCheckData}
              onSetView={setView}
              onClose={close}
              onSetAuditBlockIndex={setAuditBlockIndex}
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
                  onOpenTools={() => setView('tools')}
                  onOpenDustExplore={() => setView('dust')}
                  onOpenDivExplore={() => setView('divcards')}
                  tierSisterOpen={tierSisterOpen}
                  onToggleTierSister={() => setTierSisterOpen((v) => !v)}
                  tierSisterSide={cursorSide === 'left' ? 'right' : 'left'}
                />
              )}
              {view === 'tools' && overlayData && (
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
                    chaosPerDivine={priceCheckData.chaosPerDivine}
                    unidCandidates={priceCheckData.unidCandidates}
                    onClose={close}
                  />
                ) : (
                  <PriceCheckSkeleton />
                ))}
              <div className="flex-col flex-1 min-h-0" style={{ display: view === 'dust' ? 'flex' : 'none' }}>
                <DustExplorer onSelectItem={() => setView('item')} />
              </div>
              <div className="flex-col flex-1 min-h-0" style={{ display: view === 'divcards' ? 'flex' : 'none' }}>
                <DivCardExplorer onSelectItem={() => setView('item')} />
              </div>
              <div className="flex-col flex-1 min-h-0" style={{ display: view === 'regex' ? 'flex' : 'none' }}>
                <RegexTool />
              </div>
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
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Type augmentation for preload API
declare global {
  interface Window {
    api: import('../../../preload/index').Api
  }
}
