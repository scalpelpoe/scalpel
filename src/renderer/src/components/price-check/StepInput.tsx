import { useState } from 'react'

export function StepInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | null
  placeholder: string
  onChange: (val: string) => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const step = (dir: 1 | -1): void => {
    const current = value ?? 0
    const delta = Math.max(1, Math.round(Math.abs(current) * 0.025))
    onChange(String(current + delta * dir))
  }

  const digits = value != null ? String(Math.abs(value)).length : 0
  const width = digits >= 5 ? 60 + (digits - 4) * 8 : 60

  return (
    <div
      className="relative h-7 shrink-0"
      style={{ width }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 px-[14px] py-[2px] text-[13px] rounded-[3px] text-center bg-black/30"
        style={{ width }}
      />
      {hovered && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              step(-1)
            }}
            className="absolute left-[1px] top-[1px] bottom-[1px] w-[14px] bg-white/5 hover:bg-white/[0.12] transition-colors border-none rounded-l-[3px] text-text-dim text-[11px] cursor-pointer p-0 flex items-center justify-center"
          >
            -
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              step(1)
            }}
            className="absolute right-[1px] top-[1px] bottom-[1px] w-[14px] bg-white/5 hover:bg-white/[0.12] transition-colors border-none rounded-r-[3px] text-text-dim text-[11px] cursor-pointer p-0 flex items-center justify-center"
          >
            +
          </button>
        </>
      )}
    </div>
  )
}
