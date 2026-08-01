import { useLayoutEffect, useRef, useState } from 'react'
import { useDismissOnOutside } from '../../shared/use-dismiss-on-outside'

const MENU_CHROME = 'bg-bg-card-translucent border border-border rounded-[22px] shadow-lg'

/** A single row in the context menu. */
export interface ContextMenuItem {
  label: string
  onClick: () => void
  /** Grays out the row and blocks clicks. Useful for Paste when the clipboard
   *  is empty - the row stays visible so the menu's geometry doesn't jump
   *  between right-clicks. */
  disabled?: boolean
}

/** A horizontal divider between menu sections. Use `{ divider: true }` to
 *  insert one anywhere in the `items` array. */
export interface ContextMenuDivider {
  divider: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuDivider

function isDivider(e: ContextMenuEntry): e is ContextMenuDivider {
  return 'divider' in e
}

interface Props {
  /** Cursor position in stage-container pixels (matches the CSS coordinate
   *  space the menu's absolute positioning lives in). */
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
  /** Outer corner radius in px. Overrides `MENU_CHROME`'s 22px so the small
   *  menu doesn't read as a bubble. Defaults to one px under the inner row
   *  hover (4px Tailwind `rounded`) so the nested rounding follows the
   *  decreasing-radius rule. */
  radius?: number
  /** CSS positioning context. 'absolute' positions within the nearest
   *  positioned ancestor (whiteboard stage container coords); 'fixed'
   *  positions in viewport coords (clientX/clientY from a mouse event).
   *  Edge clamping measures against window.innerWidth/Height, which is exact
   *  for 'fixed'; 'absolute' relies on the positioned ancestor filling the
   *  viewport (true for the whiteboard stage). */
  positioning?: 'absolute' | 'fixed'
  /** Visual scale applied to the menu (transform-origin top left). Overlay
   *  consumers portal the menu to document.body to escape their transformed
   *  ancestor; that also escapes the overlay's CSS scale, so they pass the
   *  measured scale back in to visually match the panel (HoverTooltip pattern). */
  scale?: number
}

const GAP_PX = 8
const DEFAULT_RADIUS_PX = 14

export function ContextMenu({
  x,
  y,
  items,
  onClose,
  radius = DEFAULT_RADIUS_PX,
  positioning = 'absolute',
  scale = 1,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // Render off-screen on first paint so we can measure the actual size,
  // then snap to the right (or left, on the right edge).
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = x + GAP_PX
    let top = y
    // Right-edge flip: if menu would overflow right, place it to the left of the cursor.
    if (left + r.width > window.innerWidth - GAP_PX) {
      left = x - r.width - GAP_PX
    }
    // Bottom-edge clamp: keep the menu fully on screen vertically.
    if (top + r.height > window.innerHeight - GAP_PX) {
      top = window.innerHeight - r.height - GAP_PX
    }
    if (top < GAP_PX) top = GAP_PX
    if (left < GAP_PX) left = GAP_PX
    setPos({ left, top })
  }, [x, y])

  useDismissOnOutside(ref, onClose)

  return (
    // Overlay windows hit-test click-through against reported panel rects. Menus
    // portal to document.body (outside those rects), so they self-tag here and the
    // overlay's rect poll picks them up - otherwise a menu jutting past the panel
    // edge would be click-through to the game.
    <div
      ref={ref}
      data-context-menu=""
      className={`${positioning} ${MENU_CHROME} p-1 flex flex-col gap-px text-text z-[200] min-w-[140px]`}
      // Inline borderRadius wins over the Tailwind class in MENU_CHROME so
      // we don't need a hard-coded override class.
      style={{
        left: pos.left,
        top: pos.top,
        borderRadius: radius,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {items.map((entry, i) =>
        isDivider(entry) ? (
          <div key={`d${i}`} className="my-1 h-px bg-border" aria-hidden />
        ) : (
          <button
            key={entry.label}
            type="button"
            className={[
              '!bg-transparent text-left text-xs px-2 py-1.5 rounded w-full',
              entry.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:!bg-bg-hover cursor-pointer',
            ].join(' ')}
            disabled={entry.disabled}
            onClick={() => {
              if (entry.disabled) return
              entry.onClick()
              onClose()
            }}
          >
            {entry.label}
          </button>
        ),
      )}
    </div>
  )
}
