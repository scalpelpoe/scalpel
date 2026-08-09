import type { PriceEntry } from '@scalpelpoe/plugin-sdk'
import { iconForEntry } from './economy-icons'
import { priceBadge } from './economy-prices'

interface EconomyRowProps {
  entry: PriceEntry
  zebra: boolean
}

export function EconomyRow({ entry, zebra }: EconomyRowProps): JSX.Element {
  const iconUrl = iconForEntry(entry)

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${zebra ? 'bg-white/[0.02]' : ''}`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {iconUrl ? (
          <div className="relative shrink-0 w-[22px] h-[22px]">
            <img
              src={iconUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-contain scale-[1.8] blur-[6px] saturate-[2] opacity-30 pointer-events-none"
            />
            <img src={iconUrl} alt="" className="relative w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-[22px] h-[22px] shrink-0 rounded bg-white/[0.04] border border-white/[0.06]" />
        )}
        <div className="min-w-0 text-[11px] leading-snug text-[#e2e8f0] truncate">{entry.name}</div>
      </div>
      <div className="shrink-0 font-semibold text-[11px] text-[#a5f3fc] whitespace-nowrap">{priceBadge(entry)}</div>
    </div>
  )
}
