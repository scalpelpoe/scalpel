import { useEffect, useRef, useState } from 'react'
import { GridFour, GridNine, GridSixteen } from '@icon-park/react'
import type { CheatSheetsSettings, CheatSheetCategory, RuntimeSettings } from '../../../shared/types'
import { CHEAT_SHEET_MINIMIZED_HEIGHT, CHEAT_SHEET_MINIMIZED_SLACK } from '../../../shared/cheat-sheet-window'
import { Chrome } from '../secondary-overlay/Chrome'
import { useStickyZone } from '../shared/use-current-zone'

/** Three thumbnail sizes the user can flip between via the header icons. The
 *  3:2 aspect ratio is preserved so thumb sources don't need re-cropping. */
const THUMB_SIZES = {
  large: { w: 150, h: 100 },
  medium: { w: 105, h: 70 },
  small: { w: 66, h: 44 },
} as const
type ThumbSize = keyof typeof THUMB_SIZES

const STORAGE_KEY = 'scalpel:cheatsheets:thumbnailSize'
const DEFAULT_SIZE: ThumbSize = 'large'
/** Active-icon gold -- matches the league/badge gold used elsewhere. */
const ACTIVE_COLOR = '#fbbf24'
/** Window inner height at or below which we consider the cheat-sheet window
 *  "collapsed" - drives the maximize-vs-minimize icon. Matches the slack the
 *  main process uses to detect "already minimized" so the two sides agree
 *  on what counts as the minimized footprint. */
const COLLAPSED_HEIGHT_THRESHOLD = CHEAT_SHEET_MINIMIZED_HEIGHT + CHEAT_SHEET_MINIMIZED_SLACK

function loadThumbSize(): ThumbSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in THUMB_SIZES) return saved as ThumbSize
  } catch {
    /* localStorage disabled */
  }
  return DEFAULT_SIZE
}

export function App(): JSX.Element {
  const [settings, setSettings] = useState<CheatSheetsSettings | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [poeVersion, setPoeVersion] = useState<1 | 2>(1)
  const [thumbSize, setThumbSize] = useState<ThumbSize>(loadThumbSize)
  // Derive collapsed state from the live window height so the icon stays
  // correct across drag-resizes and app restarts (where react state would
  // be lost but the window itself may still be small).
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = (): void => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const minimized = windowHeight <= COLLAPSED_HEIGHT_THRESHOLD
  const currentZone = useStickyZone()

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      const cs = s.activeProfile?.cheatSheets ?? { globalHotkey: '', categories: [], pinned: false }
      setSettings(cs)
      setActiveCategoryId(cs.categories[0]?.id ?? null)
      setPoeVersion(s.poeVersion === 2 ? 2 : 1)
    })
    return window.api.onSettingUpdated((key, value) => {
      if (key === 'activeProfile') {
        const next = (value as RuntimeSettings['activeProfile'])?.cheatSheets
        if (next) setSettings(next)
      }
    })
  }, [])

  // Listen for late focus-category events fired when the window is already open.
  useEffect(() => {
    return window.api.onCheatSheetFocusCategory((categoryId) => {
      setActiveCategoryId(categoryId ?? null)
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, thumbSize)
    } catch {
      /* localStorage disabled -- silently drop the persist */
    }
  }, [thumbSize])

  if (!settings) return <div />

  const pinned = settings.pinned === true
  const onClose = (): void => window.api.closeCheatSheets()
  const toggleMinimize = (): void => {
    if (minimized) {
      window.api.restoreCheatSheets()
    } else {
      window.api.minimizeCheatSheets()
    }
  }
  const togglePin = (): void => {
    // Optimistic local update: broadcastSettingUpdate skips the sender, so we
    // never get our own echo back. Update local state immediately, then persist.
    const next: CheatSheetsSettings = { ...settings, pinned: !pinned }
    setSettings(next)
    void window.api.setProfileSettingForGame(poeVersion, 'cheatSheets', next)
  }
  const sizeControls = (
    <SizeControls value={thumbSize} onChange={setThumbSize} pinned={pinned} onTogglePin={togglePin} />
  )

  if (settings.categories.length === 0) {
    return (
      <Chrome onClose={onClose} onMinimize={toggleMinimize} minimized={minimized} headerEnd={sizeControls}>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <span className="text-[11px] text-text-dim">You didn&apos;t add any cheat sheets. Add some in Settings</span>
          <button onClick={() => window.api.openSettingsTab('cheatsheets')} className="text-[11px] px-3 py-1.5">
            Open Sheet Settings
          </button>
        </div>
      </Chrome>
    )
  }

  const active = settings.categories.find((c) => c.id === activeCategoryId) ?? settings.categories[0]
  // Don't show tabs when there's only one - it'd be a single non-functional
  // chip in the header.
  const tabs =
    settings.categories.length > 1 ? (
      <CategoryTabs categories={settings.categories} activeId={active.id} onSelect={setActiveCategoryId} />
    ) : undefined

  const dims = THUMB_SIZES[thumbSize]
  return (
    <Chrome
      onClose={onClose}
      onMinimize={toggleMinimize}
      minimized={minimized}
      headerContent={tabs}
      headerEnd={sizeControls}
    >
      <div className="flex-1 overflow-y-auto p-2 flex flex-wrap gap-2 content-start">
        {active.sheets.map((sheet) => (
          <Thumbnail
            key={sheet.id}
            categoryId={active.id}
            sheet={sheet}
            width={dims.w}
            height={dims.h}
            isCurrentZone={!!currentZone && (sheet.areaCodes?.includes(currentZone.areaCode) ?? false)}
          />
        ))}
      </div>
    </Chrome>
  )
}

function CategoryTabs({
  categories,
  activeId,
  onSelect,
}: {
  categories: CheatSheetCategory[]
  activeId: string
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`text-[10px] px-2 py-1 ${activeId === c.id ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
        >
          {c.name}
        </button>
      ))}
    </>
  )
}

/** Display labels for each thumb size, ordered large -> small so the menu
 *  reads top-down at the same cadence as the trigger-icon progression
 *  (GridFour = fewest cells = largest thumbs). */
const SIZE_OPTIONS: ReadonlyArray<{ key: ThumbSize; label: string }> = [
  { key: 'large', label: 'Large' },
  { key: 'medium', label: 'Medium' },
  { key: 'small', label: 'Small' },
]
/** Icon shown on the trigger button for each thumb size. Kept separate from
 *  SIZE_OPTIONS since the dropdown rows are label-only. */
const SIZE_TRIGGER_ICONS: Record<ThumbSize, typeof GridFour> = {
  large: GridFour,
  medium: GridNine,
  small: GridSixteen,
}

function SizeControls({
  value,
  onChange,
  pinned,
  onTogglePin,
}: {
  value: ThumbSize
  onChange: (s: ThumbSize) => void
  pinned: boolean
  onTogglePin: () => void
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the menu when the user clicks anywhere outside the wrapper. Clicks
  // on PoE don't reach this listener (different process), so the only thing
  // that can dismiss the menu is a click somewhere else inside the overlay.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // lineHeight:0 strips the inline baseline padding the icon-park <span>
  // wrapper inherits, so the glyph optically centers in the 24x24 box.
  const pinStyle: React.CSSProperties = { lineHeight: 0, color: pinned ? ACTIVE_COLOR : undefined }
  const ActiveIcon = SIZE_TRIGGER_ICONS[value]
  return (
    <>
      <button
        type="button"
        onClick={onTogglePin}
        title="Pin zone map to side"
        className={`w-6 h-6 flex items-center justify-center transition-colors ${pinned ? '' : 'text-text-dim hover:text-text'}`}
        style={pinStyle}
      >
        {/* Stripped-down @icon-park `moving-picture` glyph: kept the framed
            image rect (with its inner horizon line) and the diagonal arrow,
            culled the eight dotted-border circles. Inline-flex wrapper gives
            the SVG an intrinsic-sized bounding box that the parent flex
            container respects (raw <svg> would otherwise be squeezed by the
            button's global horizontal padding). Rotated -90deg so the arrow
            points up-and-to-the-left, mirroring "pin map to the side." */}
        <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
          <svg
            width={15}
            height={15}
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="22" width="20" height="20" rx="3" />
            <path d="M6 34L12.1195 29.4103C13.2239 28.5821 14.7509 28.6143 15.8192 29.4885L25 37" />
            <path d="M30 6L42 6L42 18" />
            <path d="M42 6L30 18" />
          </svg>
        </span>
      </button>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="Thumb size"
          className={`w-6 h-6 flex items-center justify-center transition-colors ${menuOpen ? '' : 'text-text-dim hover:text-text'}`}
          style={{ lineHeight: 0, color: menuOpen ? ACTIVE_COLOR : undefined }}
        >
          <ActiveIcon size={15} theme="outline" fill="currentColor" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 min-w-[110px] bg-bg-card-translucent border border-border rounded shadow-lg py-1 text-[11px]">
            {SIZE_OPTIONS.map(({ key, label }, i) => {
              const active = key === value
              return (
                <div key={key}>
                  {i > 0 && <div className="mx-2 h-px bg-white/5" />}
                  <button
                    type="button"
                    onClick={() => {
                      onChange(key)
                      setMenuOpen(false)
                    }}
                    className={`menu-row w-full text-left px-2 py-1 transition-colors ${
                      active ? '' : 'text-text-dim hover:text-text'
                    }`}
                    style={active ? { color: ACTIVE_COLOR } : undefined}
                  >
                    {label}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function Thumbnail({
  categoryId,
  sheet,
  width,
  height,
  isCurrentZone,
}: {
  categoryId: string
  sheet: { id: string; ext: string; areaCodes?: string[] }
  width: number
  height: number
  isCurrentZone: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const fullSrc = `cheatsheet://${categoryId}/${sheet.id}.${sheet.ext}`
  const thumbSrc = `${fullSrc}?thumb=1`

  useEffect(() => {
    if (isCurrentZone) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [isCurrentZone])

  const ringStyle: React.CSSProperties = isCurrentZone
    ? { boxShadow: '0 0 0 2px #fbbf24, 0 0 8px rgba(251, 191, 36, 0.6)' }
    : {}

  return (
    <div
      ref={ref}
      className="relative rounded overflow-hidden bg-black/30 cursor-pointer transition-[width,height] duration-150"
      style={{ width, height, ...ringStyle }}
      onMouseEnter={() => window.api.showCheatSheetPreview(fullSrc)}
      onMouseLeave={() => window.api.hideCheatSheetPreview()}
    >
      <img src={thumbSrc} alt="" draggable={false} className="w-full h-full object-cover" />
    </div>
  )
}
