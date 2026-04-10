interface BoundaryControlProps {
  value: number
  min: number
  onChange: (val: number) => void
}

export function BoundaryControl({ value, min, onChange }: BoundaryControlProps): JSX.Element {
  return (
    <div className="flex flex-col items-center shrink-0">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const val = parseInt(e.target.value)
          if (!isNaN(val) && val >= min) onChange(val)
        }}
        className="w-12 px-1 py-[5px] text-[16px] font-bold font-mono text-center bg-bg-solid text-accent border border-border rounded-[5px] relative z-[1]"
      />
      <div className="flex gap-1 mt-[3px]">
        <div
          onClick={() => value > min && onChange(value - 1)}
          className="flex items-center justify-center w-[22px] h-[20px] cursor-pointer text-text-dim hover:text-accent opacity-70 hover:opacity-100 select-none rounded-[3px] transition-[opacity,color] duration-100"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path
              d="M6.5 2L3.5 5L6.5 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          onClick={() => onChange(value + 1)}
          className="flex items-center justify-center w-[22px] h-[20px] cursor-pointer text-text-dim hover:text-accent opacity-70 hover:opacity-100 select-none rounded-[3px] transition-[opacity,color] duration-100"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path
              d="M3.5 2L6.5 5L3.5 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
