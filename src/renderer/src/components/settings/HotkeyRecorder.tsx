import { useEffect, useRef, useState } from 'react'
import { keyEventToAccelerator, prettyHotkey } from './utils'

export function HotkeyRecorder({
  value,
  onChange,
  className = 'w-[200px] shrink-0',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
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

  return (
    <div
      ref={ref}
      className={`setting-box ${className} cursor-pointer h-[34px] box-border`}
      onClick={() => setListening(true)}
    >
      <span className={`value ${listening ? 'recording' : ''}`}>
        {listening ? 'Press your key combo...' : prettyHotkey(value) || '(none set)'}
      </span>
    </div>
  )
}
