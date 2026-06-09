import { useEffect, useRef, useState } from 'react'
import { CloseSmall } from '@icon-park/react'
import { keyEventToAccelerator, prettyHotkey } from './hotkey-utils'

export function HotkeyRecorder({
  value,
  onChange,
  className = 'w-[200px] shrink-0',
  placeholder = '(none set)',
  clearable = false,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  clearable?: boolean
}): JSX.Element {
  const [listening, setListening] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listening) return
    window.api.suspendHotkeys()
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      onChange(acc)
      setListening(false)
    }
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setListening(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
      window.api.resumeHotkeys()
    }
  }, [listening, onChange])

  const showingPlaceholder = !listening && !value
  return (
    <div
      ref={ref}
      className={`setting-box group ${className} cursor-pointer h-[34px] box-border`}
      onClick={() => setListening(true)}
    >
      <span className={`value ${listening ? 'recording' : ''} ${showingPlaceholder ? 'placeholder' : ''}`}>
        {listening ? 'Press your key combo...' : prettyHotkey(value) || placeholder}
      </span>
      {clearable && value && !listening && (
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
    </div>
  )
}
