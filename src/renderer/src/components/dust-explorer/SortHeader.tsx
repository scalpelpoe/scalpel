import { Down, Up } from '@icon-park/react'
import { SortKey, SortDir } from './types'

interface SortHeaderProps {
  label: React.ReactNode
  sortKey: SortKey
  active: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  width?: number
  flex?: boolean
}

export function SortHeader({ label, sortKey, active, dir, onSort, width, flex }: SortHeaderProps): JSX.Element {
  const isActive = active === sortKey
  return (
    <div
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-[3px] cursor-pointer select-none box-border"
      style={{
        width: flex ? undefined : width,
        flex: flex ? 1 : undefined,
        justifyContent: flex ? 'flex-start' : 'flex-end',
        padding: flex ? undefined : '0 6px',
      }}
    >
      <span
        className={`text-[9px] font-semibold uppercase inline-flex items-center gap-[2px] ${isActive ? 'text-accent' : 'text-text-dim'}`}
      >
        {label}
      </span>
      <div className="flex flex-col leading-none">
        <Up
          size={8}
          theme="filled"
          fill={isActive && dir === 'asc' ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}
          style={{ display: 'block', marginBottom: -2 }}
        />
        <Down
          size={8}
          theme="filled"
          fill={isActive && dir === 'desc' ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}
          style={{ display: 'block', marginTop: -2 }}
        />
      </div>
    </div>
  )
}
