import { CloseSmall, Minus, FullScreen } from '@icon-park/react'
import appIcon from '../../../../resources/icon.png'

interface ChromeProps {
  /** Optional content rendered to the right of the logo in the header (e.g.
   *  category tabs). Lives inside the drag region but inherits no-drag from
   *  individual interactive children. */
  headerContent?: React.ReactNode
  /** Optional content rendered between `headerContent` and the close button --
   *  intended for view-control affordances (size pickers, filters, etc.) that
   *  belong on the right side of the bar. Same drag behavior as headerContent. */
  headerEnd?: React.ReactNode
  /** Body content beneath the header. */
  children: React.ReactNode
  onClose: () => void
  /** Optional minimize handler. When supplied, renders a minimize button
   *  between `headerEnd` and the close button. The caller is responsible for
   *  the actual window resize. `minimized` only controls the icon (and the
   *  tooltip): true shows the restore glyph, false shows the minimize glyph.
   *  Body content is always rendered regardless. */
  onMinimize?: () => void
  minimized?: boolean
  /** When true, squares the left corners and removes the left border so the
   *  card sits flush against a left dock (e.g. the regex remote pad when
   *  mounted against PoE's stash sidebar). Existing consumers are unaffected
   *  because this prop is optional and defaults to false. */
  flushLeft?: boolean
}

/** Standard chrome for a secondary overlay window: rounded translucent card
 *  with a draggable header containing the Scalpel logo, an optional content
 *  slot (tabs, status text, ...), and a square close button. The whole
 *  surface is sized to 100vh so it fills the BrowserWindow.
 *
 *  Consumers compose their body inside <Chrome>...</Chrome>. Interactive
 *  elements anywhere in the chrome should set
 *  `style={{ WebkitAppRegion: 'no-drag' }}` so the title-bar drag doesn't
 *  swallow their clicks. The close button + header buttons handle this
 *  automatically. */
export function Chrome({
  headerContent,
  headerEnd,
  children,
  onClose,
  onMinimize,
  minimized,
  flushLeft,
}: ChromeProps): JSX.Element {
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
  const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties
  return (
    <div
      className={`flex flex-col h-screen bg-bg-card-translucent rounded overflow-hidden border border-border${
        flushLeft ? ' rounded-l-none border-l-0' : ''
      }`}
    >
      <div
        className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border bg-bg-solid-translucent shrink-0"
        style={drag}
      >
        <div className="flex items-center gap-2 min-w-0">
          <img src={appIcon} alt="Scalpel" className="w-4 h-4 shrink-0" />
          {headerContent && (
            <div className="flex gap-[6px] flex-wrap" style={noDrag}>
              {headerContent}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {headerEnd && (
            // mr-2 only when there's a minimize button (i.e. the window
            // controls form a distinct group worth visually separating).
            // Without it, headerEnd butts directly against the close button
            // with the parent's default gap-1.
            <div className={`flex items-center gap-[4px] ${onMinimize ? 'mr-2' : ''}`} style={noDrag}>
              {headerEnd}
            </div>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              title={minimized ? 'Restore' : 'Minimize'}
              className="btn-ghost text-text-dim hover:text-text shrink-0 w-6 h-6 flex items-center justify-center"
              style={{ ...noDrag, lineHeight: 0 }}
            >
              {minimized ? (
                <FullScreen size={14} theme="outline" fill="currentColor" />
              ) : (
                <Minus size={14} theme="outline" fill="currentColor" />
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="btn-ghost text-text-dim hover:text-text shrink-0 w-6 h-6 flex items-center justify-center"
            style={noDrag}
          >
            <CloseSmall size={14} theme="outline" fill="currentColor" />
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}
