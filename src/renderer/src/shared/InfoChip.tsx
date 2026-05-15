import type { ReactNode } from 'react'

interface InfoChipProps {
  icon?: string
  label?: string
  children: ReactNode
  size?: 'sm' | 'md'
  color?: string
  className?: string
}

export function InfoChip({ icon, label, children, size = 'md', color, className }: InfoChipProps): JSX.Element {
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]'
  return (
    <div
      className={`inline-flex items-center gap-[3px] bg-black/30 rounded-full px-2 py-[3px] ${textSize} ${className ?? ''}`}
      style={color ? { color } : undefined}
    >
      {icon && <img src={icon} alt="" className="w-3 h-3" />}
      {label && <span className="text-text-dim">{label}</span>}
      {children}
    </div>
  )
}
