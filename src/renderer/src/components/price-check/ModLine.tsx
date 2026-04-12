import { useState } from 'react'
import { MOD_COLORS } from './constants'

interface ModLineProps {
  text: string
  color: string
  tierInfo?: { tier: string; name: string; ranges: string }
}

function formatTierLabel(tier: string): string {
  if (!tier) return ''
  // P0, P1, S2 etc -> [P0], [S2]
  return `[${tier}]`
}

function formatHoverText(tierInfo: { tier: string; name: string; ranges: string }): string {
  const type = tierInfo.tier.startsWith('P') ? 'Prefix' : tierInfo.tier.startsWith('S') ? 'Suffix' : ''
  const parts: string[] = []
  if (type) parts.push(type)
  if (tierInfo.name) parts.push(`"${tierInfo.name}"`)
  if (tierInfo.tier) parts.push(`Tier: ${tierInfo.tier.slice(1)}`)
  if (tierInfo.ranges) parts.push(`(${tierInfo.ranges})`)
  return parts.join(' ')
}

export function ModLine({ text, color, tierInfo }: ModLineProps): JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="text-[10px] relative text-center cursor-default select-none"
      style={{ paddingLeft: tierInfo?.tier ? 30 : 0, paddingRight: tierInfo?.tier ? 30 : 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {tierInfo?.tier && (
        <span
          className="absolute top-0 left-0 transition-opacity duration-100"
          style={{
            opacity: hovered ? 0 : 1,
            color: tierInfo.tier.startsWith('P')
              ? MOD_COLORS.tierPrefix
              : tierInfo.tier.startsWith('S')
                ? MOD_COLORS.tierSuffix
                : 'rgba(255,255,255,0.6)',
          }}
        >
          {formatTierLabel(tierInfo.tier)}
        </span>
      )}
      <span className="transition-opacity duration-100" style={{ color, opacity: hovered && tierInfo?.tier ? 0 : 1 }}>
        {text}
      </span>
      {tierInfo?.tier && (
        <span
          className="absolute inset-0 flex items-center justify-center text-white/40 transition-opacity duration-100 pointer-events-none"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          {formatHoverText(tierInfo)}
        </span>
      )}
    </div>
  )
}
