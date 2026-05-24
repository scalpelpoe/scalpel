import { Buy, PreviewOpen, PreviewClose } from '@icon-park/react'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'
import { chaosIcon, divineIcon } from '../../shared/icons'
import { IconGlow } from '../../shared/IconGlow'
import { CurrencyChip } from '../../shared/CurrencyChip'
import { DustEntry } from './types'
import { COL_PRICE, COL_DUST, COL_DPC, COL_DPCS, mirrorIconUrl } from './constants'
import { formatDust, formatRatio } from './utils'
import { zebraRowBg } from '../../shared/utils'

interface DustEntryRowProps {
  entry: DustEntry
  index: number
  divineRate: number
  mirrorRate: number
  classMap: Record<string, string>
  onSelectItem?: () => void
  onPriceCheckItem?: () => void
  visibility?: 'Show' | 'Hide'
}

export function DustEntryRow({
  entry,
  index,
  divineRate,
  mirrorRate,
  classMap,
  onSelectItem,
  onPriceCheckItem,
  visibility,
}: DustEntryRowProps): JSX.Element {
  const loadItem = (): void => {
    window.api.lookupBaseType(entry.baseType, classMap[entry.baseType] || '', 'Unique', entry.name)
  }
  const openPriceCheck = (): void => {
    // Routes through main's runPriceCheck so it fires 'price-check-open', which
    // arms the priceCheckPending flag in App. That flag then suppresses the
    // 'item' view-switch in onOverlayData. The actual setView('pricecheck')
    // happens via onPriceCheckItem -- the IPC just guards against the race.
    window.api.sisterOpenPriceCheck({ name: entry.name, baseType: entry.baseType, category: 'unique' })
  }
  return (
    <div
      className="flex items-center gap-[6px] px-3 py-1"
      style={{ background: zebraRowBg(index, 'rgba(255,255,255,0.03)') }}
    >
      {/* Icon with glow */}
      {entry.iconUrl ? (
        <IconGlow src={entry.iconUrl} size={22} blur={10} saturate={2.5} opacity={0.35} />
      ) : (
        <div className="w-[22px] h-[22px] shrink-0" />
      )}

      {/* Filter visibility status icon */}
      {visibility && (
        <span
          title={visibility === 'Show' ? 'Shown by your filter' : 'Hidden by your filter'}
          className="shrink-0 flex items-center"
          style={{
            color: visibility === 'Show' ? 'var(--text-dim)' : 'var(--hide-color)',
            opacity: visibility === 'Show' ? 0.5 : 0.9,
          }}
        >
          {visibility === 'Show' ? (
            <PreviewOpen size={12} theme="outline" fill="currentColor" />
          ) : (
            <PreviewClose size={12} theme="outline" fill="currentColor" />
          )}
        </span>
      )}

      {/* Name */}
      <span
        onClick={() => {
          loadItem()
          onSelectItem?.()
        }}
        className="flex-1 text-[11px] text-text overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer hover:text-accent"
      >
        {entry.name}
      </span>

      {/* Price-check shortcut -- jumps straight to the price tab so users browsing
          the dust list can buy without an extra click. */}
      <button
        onClick={() => {
          openPriceCheck()
          onPriceCheckItem?.()
        }}
        title={`Price check ${entry.name}`}
        className="inline-flex items-center justify-center rounded bg-white/[0.06] hover:bg-white/[0.12] h-[20px] px-[6px] text-[10px] shrink-0 cursor-pointer box-border"
      >
        <Buy size={12} theme="outline" fill="currentColor" />
      </button>

      {/* Price chip */}
      {entry.chaosValue !== null ? (
        (() => {
          const chipClass =
            'inline-flex items-center gap-[3px] rounded bg-white/[0.06] px-[6px] py-[2px] text-[10px] shrink-0 justify-end whitespace-nowrap box-border'
          const inMir = mirrorRate > 0 ? entry.chaosValue / mirrorRate : 0
          const inDiv = divineRate > 0 ? entry.chaosValue / divineRate : 0
          if (inMir >= 1)
            return (
              <CurrencyChip
                value={inMir >= 10 ? String(Math.round(inMir)) : inMir.toFixed(1)}
                icon={mirrorIconUrl}
                iconPosition="after"
                className={chipClass}
                style={{ width: COL_PRICE }}
              />
            )
          if (inDiv >= 1)
            return (
              <CurrencyChip
                value={inDiv >= 10 ? String(Math.round(inDiv)) : inDiv.toFixed(1)}
                icon={divineIcon}
                iconPosition="after"
                className={chipClass}
                style={{ width: COL_PRICE }}
              />
            )
          return (
            <CurrencyChip
              value={
                entry.chaosValue >= 1000
                  ? `${(entry.chaosValue / 1000).toFixed(1)}k`
                  : String(Math.round(entry.chaosValue))
              }
              icon={chaosIcon}
              iconPosition="after"
              className={chipClass}
              style={{ width: COL_PRICE }}
            />
          )
        })()
      ) : (
        <span
          className="inline-flex items-center gap-[3px] rounded bg-white/[0.06] px-[6px] py-[2px] text-[10px] shrink-0 justify-end whitespace-nowrap box-border"
          style={{ width: COL_PRICE }}
        >
          <span className="text-text-dim text-[9px]">--</span>
        </span>
      )}

      {/* Dust chip */}
      <CurrencyChip
        value={formatDust(entry.dustIlvl84)}
        icon={dustIcon}
        className="inline-flex items-center gap-[3px] rounded bg-white/[0.06] px-[6px] py-[2px] text-[10px] shrink-0 justify-end whitespace-nowrap box-border"
        style={{ width: COL_DUST }}
      />

      {/* Dust/chaos chip */}
      <span
        className="inline-flex items-center gap-[3px] rounded bg-white/[0.06] px-[6px] py-[2px] text-[10px] shrink-0 justify-end whitespace-nowrap box-border"
        style={{ width: COL_DPC }}
      >
        {entry.dustPerChaos !== null ? (
          <>
            <img src={dustIcon} alt="" className="w-[10px] h-[10px]" />
            <span className="text-white font-semibold">{formatRatio(entry.dustPerChaos)}</span>
            <span className="text-text-dim text-[8px]">/</span>
            <img src={chaosIcon} alt="" className="w-[10px] h-[10px]" />
          </>
        ) : (
          <span className="text-text-dim text-[9px]">--</span>
        )}
      </span>

      {/* Dust/chaos/slot chip */}
      <span
        className="inline-flex items-center gap-[3px] rounded bg-white/[0.06] px-[6px] py-[2px] text-[10px] shrink-0 justify-end whitespace-nowrap box-border"
        style={{ width: COL_DPCS }}
      >
        {entry.dustPerChaosPerSlot !== null ? (
          <>
            <img src={dustIcon} alt="" className="w-[10px] h-[10px]" />
            <span className="text-white font-semibold">{formatRatio(entry.dustPerChaosPerSlot)}</span>
          </>
        ) : (
          <span className="text-text-dim text-[9px]">--</span>
        )}
      </span>
    </div>
  )
}
