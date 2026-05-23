import { getCurrencyIcons } from '../../shared/icons'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'
import { type AuditItem, calcMaxDust, divCardArtMap, formatDust, mirrorIcon } from './constants'
import { IconGlow } from '../../shared/IconGlow'
import { CurrencyChip } from '../../shared/CurrencyChip'
import { usePoeVersion } from '../../shared/poe-version-context'

interface AuditRowProps {
  item: AuditItem
  upTo?: boolean
  divineRate: number
  mirrorRate: number
  itemClass: string
  onSelectItem?: () => void
}

export function AuditRow({
  item,
  upTo,
  divineRate: _divineRate,
  mirrorRate,
  itemClass,
  onSelectItem,
}: AuditRowProps): JSX.Element {
  // Price chip currency icons flip per game: PoE1 shows chaos/divine, PoE2
  // shows exalted/divine. `PriceInfo.chaosValue` is named for PoE1 history
  // but its semantic meaning is "baseline currency count" -- exalted in PoE2.
  const poeVersion = usePoeVersion()
  const { baseline: baselineIcon, divine: divineIcon } = getCurrencyIcons(poeVersion)
  const isPoe1 = poeVersion === 1
  const isDivCard = itemClass === 'Divination Cards'
  const divArt = isDivCard ? divCardArtMap.get(item.name) : undefined
  const divCardUrl = divArt ? `https://web.poecdn.com/image/divination-card/${divArt}.png` : undefined
  const _iconSrc = divCardUrl ?? item.iconUrl

  return (
    <div
      className="flex items-center gap-2 relative overflow-hidden"
      style={{
        padding: divCardUrl ? '0 12px 0 0' : '5px 12px',
      }}
    >
      {/* Icon with glow */}
      {divCardUrl ? (
        <div className="relative w-8 shrink-0 self-stretch overflow-visible">
          <img
            src={divCardUrl}
            alt=""
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 object-cover opacity-40 pointer-events-none"
            style={{ filter: 'blur(8px) saturate(2)' }}
          />
          <img src={divCardUrl} alt="" className="w-8 h-full object-cover relative z-[1]" />
        </div>
      ) : item.iconUrl ? (
        <IconGlow src={item.iconUrl} size={22} blur={10} saturate={2.5} opacity={0.35} />
      ) : (
        <div className="w-[22px] h-[22px] shrink-0" />
      )}

      {/* Item name */}
      <span
        onClick={() => {
          window.api.lookupBaseType(item.name, itemClass, upTo ? 'Unique' : undefined)
          onSelectItem?.()
        }}
        className="flex-1 text-[11px] text-text overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer relative z-[2] hover:text-accent"
      >
        {item.name}
      </span>

      {/* Price chip */}
      {item.chaosValue !== null ? (
        (() => {
          const chipClass =
            'inline-flex items-center gap-[3px] text-[11px] bg-white/[0.06] rounded px-[6px] py-[2px] shrink-0 w-[58px] box-border justify-end whitespace-nowrap relative z-[2]'
          const inMir = mirrorRate > 0 && item.chaosValue !== null ? item.chaosValue / mirrorRate : 0
          if (inMir >= 1)
            return (
              <CurrencyChip
                value={inMir >= 10 ? String(Math.round(inMir)) : inMir.toFixed(1)}
                icon={mirrorIcon}
                iconSize={14}
                iconPosition="after"
                className={chipClass}
              />
            )
          if (item.divineValue != null && item.divineValue >= 1)
            return (
              <CurrencyChip
                value={item.divineValue}
                icon={divineIcon}
                iconSize={14}
                iconPosition="after"
                className={chipClass}
              />
            )
          return (
            <CurrencyChip
              value={item.chaosValue}
              icon={baselineIcon}
              iconSize={14}
              iconPosition="after"
              className={chipClass}
            />
          )
        })()
      ) : (
        <span className="text-[10px] text-text-dim shrink-0 w-[58px] box-border text-right relative z-[2]">
          No price
        </span>
      )}

      {/* Dust chip -- PoE1 only, since dust is a Reverie / Kingsmarch mechanic
          that doesn't exist in PoE2 (some base names overlap between games, so
          calcMaxDust would return a value even for PoE2 uniques without the
          version guard). */}
      {isPoe1 &&
        upTo &&
        (() => {
          const dust = calcMaxDust(item.name)
          if (!dust) return null
          return (
            <CurrencyChip
              value={formatDust(dust)}
              icon={dustIcon}
              iconSize={14}
              className="inline-flex items-center gap-[3px] text-[11px] bg-white/[0.06] rounded px-[6px] py-[2px] shrink-0 w-[58px] box-border justify-end whitespace-nowrap"
            />
          )
        })()}
    </div>
  )
}
