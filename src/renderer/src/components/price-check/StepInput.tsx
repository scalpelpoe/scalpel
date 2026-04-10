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

  return (
    <div
      className="relative w-[60px] h-7 shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-[60px] h-7 px-[14px] py-[2px] text-[13px] rounded-[3px] text-center bg-black/30"
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
