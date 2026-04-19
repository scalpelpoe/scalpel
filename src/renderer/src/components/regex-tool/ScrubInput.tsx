import { useState, useRef, useEffect } from 'react'
import { SortFour } from '@icon-park/react'

interface ScrubInputProps {
  value: number | null
  onChange: (val: number | null) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
  /** Value to prefill when clicking into an empty input */
  defaultValue?: number | null
  /** Override text color (e.g. to tint when the value is invalid) */
  color?: string
  /** Decorative suffix shown next to the value in display mode (not during edit). */
  suffix?: string
}

export function ScrubInput({
  value,
  onChange,
  placeholder = '0',
  min = 0,
  max = 99999,
  step = 1,
  defaultValue,
  color,
  suffix,
}: ScrubInputProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrubRef = useRef<{ startX: number; startVal: number } | null>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitEdit = () => {
    setEditing(false)
    const parsed = parseInt(editText)
    if (isNaN(parsed) || parsed === 0) onChange(null)
    else onChange(Math.min(max, Math.max(min, parsed)))
  }

  const startScrub = (e: React.MouseEvent) => {
    if (editing) return
    e.preventDefault()
    scrubRef.current = { startX: e.clientX, startVal: value ?? 0 }
    document.body.style.cursor = 'ew-resize'
    document.body.classList.add('scrubbing')

    let lastX = e.clientX
    let accumulator = value ?? 0

    const onMove = (me: MouseEvent) => {
      if (!scrubRef.current) return
      const dx = me.clientX - lastX
      lastX = me.clientX
      const magnitude = Math.abs(accumulator)
      const speed = magnitude >= 1000 ? 5 : magnitude >= 100 ? 2 : magnitude >= 10 ? 1 : 0.5
      accumulator += (dx * speed * step) / 3
      const clamped = Math.min(max, Math.max(min, accumulator))
      const snapped = Math.round(clamped / step) * step
      onChange(snapped !== 0 ? snapped : null)
    }

    const onUp = () => {
      scrubRef.current = null
      document.body.style.cursor = ''
      document.body.classList.remove('scrubbing')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!scrubRef.current) {
      if (value == null && defaultValue != null) {
        onChange(defaultValue)
        setEditText(String(defaultValue))
      } else {
        setEditText(value != null ? String(value) : '')
      }
      setEditing(true)
    }
  }

  return (
    <div
      onMouseDown={editing ? undefined : startScrub}
      onClick={editing ? undefined : handleClick}
      className="w-[70px] h-7 flex items-center justify-between px-2 rounded-[3px] text-[13px] select-none"
      style={{
        background: 'rgba(0,0,0,0.3)',
        cursor: editing ? 'text' : 'ew-resize',
        color: color ?? (value != null ? 'var(--text)' : 'var(--text-dim)'),
        border: editing ? '1px solid rgba(0,0,0,0.2)' : '1px solid transparent',
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full bg-transparent border-none outline-none text-[13px] text-inherit"
          style={{ padding: 0 }}
          min={min}
          max={max}
        />
      ) : (
        <span style={value == null ? { opacity: 0.4 } : undefined}>
          {value ?? placeholder}
          {suffix}
        </span>
      )}
      <SortFour size={11} theme="outline" fill="currentColor" style={{ transform: 'rotate(90deg)', opacity: 0.35 }} />
    </div>
  )
}
