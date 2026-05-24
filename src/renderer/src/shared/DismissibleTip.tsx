import { useState, useEffect } from 'react'
import { CloseSmall } from '@icon-park/react'

const TIP_KEY_PREFIX = 'tip.'
const DISMISS_EVENT = 'scalpel:dismissible-tip-dismissed'

interface DismissibleTipProps {
  /** Unique id for this tip; persists dismissal at `tip.<id>.dismissed` in localStorage.
   * Multiple instances sharing the same id all dismiss together when any one is dismissed. */
  id: string
  children: React.ReactNode
  /** When false, the tip has no close button and ignores any persisted dismissal --
   * it always shows. Defaults to true. */
  dismissible?: boolean
}

export function DismissibleTip({ id, children, dismissible = true }: DismissibleTipProps): JSX.Element | null {
  const key = `${TIP_KEY_PREFIX}${id}.dismissed`
  const [dismissed, setDismissed] = useState(() => dismissible && localStorage.getItem(key) === '1')

  // Sync sibling instances with the same id: when one dismisses, the others hide too
  // without needing a remount. Per-instance useState would otherwise keep them visible
  // until reload.
  useEffect(() => {
    if (!dismissible || dismissed) return
    const handler = (e: Event): void => {
      if ((e as CustomEvent<string>).detail === id) setDismissed(true)
    }
    window.addEventListener(DISMISS_EVENT, handler)
    return () => window.removeEventListener(DISMISS_EVENT, handler)
  }, [id, dismissed, dismissible])

  if (dismissed) return null
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px]"
      style={{
        background: 'rgba(200, 169, 110, 0.10)',
        border: '1px solid rgba(200, 169, 110, 0.45)',
        color: 'var(--accent)',
      }}
    >
      <span
        className="flex items-center justify-center rounded-full text-[9px] font-bold shrink-0"
        style={{ width: 14, height: 14, background: 'var(--accent)', color: '#0a0a0a' }}
      >
        i
      </span>
      <span className="flex-1">{children}</span>
      {dismissible && (
        <CloseSmall
          size={12}
          theme="outline"
          fill="currentColor"
          className="cursor-pointer opacity-60 hover:opacity-100 shrink-0"
          onClick={() => {
            localStorage.setItem(key, '1')
            setDismissed(true)
            window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: id }))
          }}
        />
      )}
    </div>
  )
}
