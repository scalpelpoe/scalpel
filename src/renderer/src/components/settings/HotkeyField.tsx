import { useEffect, useRef, useState } from 'react'
import { CloseSmall } from '@icon-park/react'
import { keyEventToAccelerator, prettyHotkey } from './utils'

/** Full-width hotkey recorder with the standard `setting-box` chrome and a
 *  trailing "Change" button. Shared by every settings/onboarding row that
 *  records a single accelerator (filter hotkey, price-check hotkey, cheat-
 *  sheet global + per-category hotkeys, both onboarding steps).
 *
 *  The compact 200px-wide variant used inside macro rows lives in
 *  HotkeyRecorder.tsx - that one omits the Change button so it fits next to
 *  command/select inputs. */
export function HotkeyField({
  value,
  onChange,
  placeholder = 'No Hotkey Set',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): JSX.Element {
  const [recording, setRecording] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    window.api.suspendHotkeys()
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      onChange(acc)
      setRecording(false)
    }
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setRecording(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
      window.api.resumeHotkeys()
    }
  }, [recording, onChange])

  return (
    <div ref={ref}>
      <div className="setting-box group" onClick={() => setRecording(true)}>
        <span className={`value ${recording ? 'recording' : ''}`}>
          {recording ? 'Press your desired key combo...' : prettyHotkey(value) || placeholder}
        </span>
        {!recording && (
          // Wrap so the two buttons stay clustered to the right - the
          // setting-box uses justify-between, so without a wrapper the X
          // would float to the middle instead of sitting next to Change.
          <div className="flex items-center gap-2 shrink-0">
            {value && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChange('')
                }}
                title="Clear hotkey"
                className="flex items-center justify-center w-5 h-5 shrink-0 rounded bg-white/[0.06] border-none cursor-pointer text-text-dim p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[rgba(239,83,80,0.2)] hover:text-white"
              >
                <CloseSmall size={14} theme="outline" fill="currentColor" className="flex" />
              </button>
            )}
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation()
                setRecording(true)
              }}
            >
              Change
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
