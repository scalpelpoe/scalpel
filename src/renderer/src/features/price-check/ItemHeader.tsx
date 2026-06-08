import type { PriceInfo } from '../../../../shared/types'
import { getGameFeatures } from '../../../../shared/game-features'
import { usePoeVersion } from '../../shared/poe-version-context'
import { IconGlow } from '../../shared/IconGlow'
import { PriceChip } from '../../shared/PriceChip'
import { InfoChip } from '../../shared/InfoChip'
import { ExternalLinkButton } from '../../shared/ExternalLinkButton'
import { CurrencyIcon } from '../../shared/CurrencyIcon'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'

export function ItemHeader({
  heroIcon,
  heroName,
  baseType,
  color,
  isDivCard,
  priceInfo,
  chaosPerDivine,
  stackSize,
  maxStackSize,
  dustInfo,
  areaLevel,
  heistJob,
  onOpenWiki,
  onOpenPoeDb,
  onOpenNinja,
}: {
  heroIcon: string | null
  heroName: string
  baseType: string
  color: string
  isDivCard: boolean
  priceInfo?: PriceInfo
  chaosPerDivine?: number
  stackSize?: number
  maxStackSize?: number
  dustInfo?: { value: number; upTo?: boolean } | null
  areaLevel?: number
  heistJob?: { skill: string; level: number }
  onOpenWiki?: () => void
  onOpenPoeDb?: () => void
  onOpenNinja?: () => void
}): JSX.Element {
  const version = usePoeVersion()
  const baselineCurrencyKey = version === 2 ? 'exalted' : 'chaos'
  const features = getGameFeatures(version)
  const showDust = features.dustExplorer && dustInfo

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
        <div className="font-bold text-sm truncate" style={{ color }}>
          {heroName}
        </div>
        {heroName !== baseType && <div className="text-text-dim text-[11px]">{baseType}</div>}
        {(areaLevel || heistJob) && (
          <div className="text-text-dim text-[10px] flex gap-2 mt-[2px]">
            {areaLevel && (
              <span>
                Area Level: <span className="text-text font-semibold">{areaLevel}</span>
              </span>
            )}
            {heistJob && (
              <span>
                {heistJob.skill}: <span className="text-text font-semibold">Lv{heistJob.level}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 items-end shrink-0">
        {/* Dust + Ninja price + stack pricing chips */}
        {((priceInfo && priceInfo.chaosValue > 0) || showDust) && (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {showDust && (
              <InfoChip icon={dustIcon}>
                <span className="text-white font-semibold">
                  {dustInfo!.upTo ? `~${dustInfo!.value.toLocaleString()}` : dustInfo!.value.toLocaleString()}
                </span>
              </InfoChip>
            )}
            {priceInfo && priceInfo.chaosValue > 0 && (
              <PriceChip
                chaosValue={priceInfo.chaosValue}
                divineValue={priceInfo.divineValue}
                graph={priceInfo.graph}
                showNinja
              />
            )}
            {priceInfo && stackSize != null && stackSize > 1 && (
              <PriceChip
                chaosValue={priceInfo.chaosValue * stackSize}
                chaosPerDivine={chaosPerDivine}
                label={`${stackSize}x =`}
                size="sm"
              />
            )}
            {priceInfo && maxStackSize != null && maxStackSize > 1 && maxStackSize !== stackSize && (
              <PriceChip
                chaosValue={priceInfo.chaosValue * maxStackSize}
                chaosPerDivine={chaosPerDivine}
                label={`${maxStackSize}x =`}
                size="sm"
              />
            )}
          </div>
        )}
        {/* Exchange rate row -- "Open in" chip sits to the left of the chaos/divine rate */}
        <div className="flex items-center gap-1 justify-end">
          {(onOpenWiki || onOpenPoeDb || onOpenNinja) && (
            <InfoChip className="!px-[3px]">
              {onOpenWiki && (
                <ExternalLinkButton label="Wiki" title="Open the wiki page in your browser" onClick={onOpenWiki} />
              )}
              {onOpenPoeDb && (
                <ExternalLinkButton label="PoEDB" title="Open the PoEDB page in your browser" onClick={onOpenPoeDb} />
              )}
              {onOpenNinja && (
                <ExternalLinkButton
                  label="Ninja"
                  title="Open the poe.ninja page for this item in your browser"
                  onClick={onOpenNinja}
                />
              )}
            </InfoChip>
          )}
          {chaosPerDivine != null && chaosPerDivine > 0 && (
            <div className="exchange-rate-chip flex items-center gap-[3px] bg-black/30 rounded-full px-2 py-[3px] text-[11px] font-[inherit] relative cursor-default">
              <CurrencyIcon name={baselineCurrencyKey} className="w-3 h-3" />
              <span className="font-semibold">{Math.round(chaosPerDivine)}</span>
              <span className="text-text-dim">=</span>
              <span className="font-semibold">1</span>
              <CurrencyIcon name="divine" className="w-3 h-3" />
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
                      <span style={{ color: 'var(--text-dim)', minWidth: 28, textAlign: 'right' }}>
                        {div.toFixed(1)}
                      </span>
                      <CurrencyIcon name="divine" className="w-[10px] h-[10px]" />
                      <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>=</span>
                      <span style={{ color: 'var(--text)', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
                        {chaos}
                      </span>
                      <CurrencyIcon name={baselineCurrencyKey} className="w-[10px] h-[10px]" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
