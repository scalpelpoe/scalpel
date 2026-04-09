import type { PriceInfo } from '../../../../shared/types'
import { chaosIcon, divineIcon, ninjaIcon, formatPrice } from './constants'
import { IconGlow } from '../../shared/IconGlow'

export function ItemHeader({
  heroIcon,
  heroName,
  baseType,
  color,
  isDivCard,
  priceInfo,
  chaosPerDivine,
}: {
  heroIcon: string | null
  heroName: string
  baseType: string
  color: string
  isDivCard: boolean
  priceInfo?: PriceInfo
  chaosPerDivine?: number
}): JSX.Element {
  return (
    <div className="bg-bg-card border-b border-border px-[14px] py-[10px] flex gap-[10px] items-center">
      {heroIcon && (
        <IconGlow
          src={heroIcon}
          size={isDivCard ? 44 : 32}
          height={32}
          glowWidth={isDivCard ? 70 : 64}
          glowHeight={isDivCard ? 50 : 64}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm" style={{ color }}>
          {heroName}
        </div>
        {heroName !== baseType && <div className="text-text-dim text-[11px]">{baseType}</div>}
      </div>
      <div className="flex flex-col gap-1 items-end shrink-0">
        {/* Ninja price chip */}
        {priceInfo && priceInfo.chaosValue > 0 && (
          <div className="flex items-center gap-[3px] bg-black/30 rounded-full px-2 py-[3px] text-[11px] font-[inherit]">
            <img src={ninjaIcon} alt="" className="w-[10px] h-[10px]" />
            {priceInfo.divineValue != null && priceInfo.divineValue >= 1 ? (
              <>
                <span className="font-semibold">{formatPrice(priceInfo.divineValue)}</span>
                <img src={divineIcon} alt="" className="w-3 h-3" />
              </>
            ) : (
              <>
                <span className="font-semibold">{formatPrice(priceInfo.chaosValue)}</span>
                <img src={chaosIcon} alt="" className="w-3 h-3" />
              </>
            )}
          </div>
        )}
        {/* Exchange rate chip */}
        {chaosPerDivine != null && chaosPerDivine > 0 && (
          <div className="exchange-rate-chip flex items-center gap-[3px] bg-black/30 rounded-full px-2 py-[3px] text-[11px] font-[inherit] relative cursor-default">
            <img src={chaosIcon} alt="" className="w-3 h-3" />
            <span className="font-semibold">{Math.round(chaosPerDivine)}</span>
            <span className="text-text-dim">=</span>
            <span className="font-semibold">1</span>
            <img src={divineIcon} alt="" className="w-3 h-3" />
            <div
              className="exchange-rate-tooltip"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                padding: '8px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                fontSize: 10,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                zIndex: 10,
              }}
            >
              {Array.from({ length: 10 }, (_, i) => {
                const div = (i + 1) / 10
                const chaos = Math.round(chaosPerDivine * div)
                return (
                  <div
                    key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}
                  >
                    <span style={{ color: 'var(--text-dim)', minWidth: 28, textAlign: 'right' }}>{div.toFixed(1)}</span>
                    <img src={divineIcon} alt="" style={{ width: 10, height: 10 }} />
                    <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>=</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
                      {chaos}
                    </span>
                    <img src={chaosIcon} alt="" style={{ width: 10, height: 10 }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
