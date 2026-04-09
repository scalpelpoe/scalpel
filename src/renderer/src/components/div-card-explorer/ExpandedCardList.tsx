import { chaosIcon } from '../../shared/icons'
import { IconGlow } from '../../shared/IconGlow'
import { MapCardEntry } from './types'
import { formatEv } from './utils'
import { PriceChip } from './PriceChip'

interface ExpandedCardListProps {
  cards: MapCardEntry[]
  r: number
  g: number
  divineRate: number
  cardTiers: Record<string, string>
  flaggedCards: Set<string>
  hiddenCards: Record<string, boolean>
  onSelectCard: (cardName: string) => void
  onToggleFlag: (cardName: string) => void
}

export function ExpandedCardList({
  cards,
  r,
  g,
  divineRate,
  cardTiers,
  flaggedCards,
  hiddenCards,
  onSelectCard,
  onToggleFlag,
}: ExpandedCardListProps): JSX.Element {
  const flaggedCount = cards.filter((c) => flaggedCards.has(c.card.name)).length

  return (
    <div className="bg-bg-card" style={{ borderLeft: `3px solid rgba(${r},${g},40,0.5)` }}>
      {/* Card list header */}
      <div className="flex items-center gap-[10px] py-[6px] pr-[14px] pl-0 text-[10px] font-bold text-text-dim uppercase tracking-[0.5px] border-b border-border bg-[rgba(0,0,0,0.3)]">
        <div style={{ width: Math.round(34 * (237 / 170)) }} className="shrink-0" />
        <span className="flex-1">Card</span>
        <span className="w-[55px] text-right">Weight</span>
        <span className="w-[65px] text-right">Price</span>
        <span className="w-[55px] text-right">EV/Map</span>
        <span className="w-5" />
      </div>

      {/* Outlier notice */}
      {flaggedCount > 0 && (
        <div className="py-1 px-[14px] text-[10px] text-[#ef9a3f] bg-[rgba(239,154,63,0.06)] border-b border-border">
          {flaggedCount} outlier{flaggedCount > 1 ? 's' : ''} excluded from EV
        </div>
      )}

      {cards.map((c, j) => {
        const isHighValue = c.card.price >= (divineRate > 0 ? divineRate : 200)
        const isRowHidden = !!hiddenCards[c.card.name]
        const isFlagged = flaggedCards.has(c.card.name)
        return (
          <div
            key={c.card.name}
            className="flex items-center gap-[10px] pr-[14px] pl-0 py-0 text-[13px] min-h-[34px]"
            style={{
              background: isFlagged ? 'rgba(239,154,63,0.05)' : j % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              opacity: isRowHidden ? 0.35 : isFlagged ? 0.5 : c.cardEv < 0.0001 ? 0.4 : 1,
              overflow: j === 0 ? 'visible' : 'hidden',
            }}
          >
            <IconGlow
              src={`https://web.poecdn.com/image/divination-card/${c.card.art}.png`}
              size={Math.round(34 * (237 / 170))}
              height={34}
              glowWidth={Math.round(34 * (237 / 170)) + 28}
              glowHeight={60}
              blur={8}
              saturate={2}
              objectFit="cover"
              className="overflow-visible"
              imgStyle={{ zIndex: 1 }}
            />
            <span
              onClick={() => onSelectCard(c.card.name)}
              className={`flex-1 relative z-[2] cursor-pointer hover:underline ${isHighValue ? 'text-accent font-semibold' : 'text-text font-normal'}`}
            >
              {c.card.name}
              {cardTiers[c.card.name] && (
                <span className="text-text-dim text-[10px] font-normal ml-[6px]">{cardTiers[c.card.name]}</span>
              )}
            </span>
            <span className="text-[11px] text-text-dim relative z-[2] font-mono w-[55px] text-right">
              {Math.round(c.card.weight)}
              {c.card.weightEstimated ? '*' : ''}
            </span>
            <span
              className={`text-[11px] text-text-dim relative z-[2] font-mono w-[65px] text-right ${isFlagged ? 'line-through' : ''}`}
            >
              <PriceChip value={c.card.price} divineRate={divineRate} />
            </span>
            <span
              className={`text-[11px] font-mono relative z-[2] w-[55px] text-right flex items-center justify-end gap-[3px] ${isFlagged ? 'text-[#ef9a3f]' : 'text-text-dim'}`}
            >
              {isFlagged ? '--' : formatEv(c.cardEv)}
              {!isFlagged && c.card.weightEstimated ? '*' : ''}
              {!isFlagged && <img src={chaosIcon} alt="" className="w-3 h-3" />}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                onToggleFlag(c.card.name)
              }}
              title={isFlagged ? 'Unflag outlier' : 'Flag as outlier'}
              className={`w-5 text-center cursor-pointer relative z-[2] text-[11px] select-none ${isFlagged ? 'text-[#ef9a3f]' : 'text-text-dim'}`}
              style={{ opacity: isFlagged ? 1 : 0.3 }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = isFlagged ? '1' : '0.3'
              }}
            >
              {isFlagged ? '\u2716' : '\u2691'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
