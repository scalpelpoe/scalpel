interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
  color?: string
  icon?: string
}

export function FilterChip({ label, active, onClick, color = 'var(--accent)', icon }: FilterChipProps): JSX.Element {
  const isAccent = color === 'var(--accent)'
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-1 px-[10px] py-1 rounded-full cursor-pointer text-[11px] font-semibold select-none relative overflow-hidden"
      style={{
        background: active ? (isAccent ? 'rgba(200,169,110,0.13)' : `${color}22`) : 'rgba(0,0,0,0.25)',
        border: active
          ? isAccent
            ? '1px solid rgba(200,169,110,0.4)'
            : `1px solid ${color}66`
          : '1px solid var(--border)',
        opacity: active ? 1 : 0.5,
        color: active ? color : 'var(--text-dim)',
      }}
    >
      {icon && active && (
        <img
          src={icon}
          alt=""
          className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ width: 28, height: 28, objectFit: 'contain', filter: 'blur(6px) saturate(3)', opacity: 0.5 }}
        />
      )}
      {icon && <img src={icon} alt="" className="relative -ml-[3px]" style={{ width: 14, height: 14 }} />}
      <span className="relative">{label}</span>
    </div>
  )
}
