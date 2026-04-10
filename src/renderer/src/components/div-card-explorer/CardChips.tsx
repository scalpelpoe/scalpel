import { MapCardEntry, TierStyle } from './types'

interface CardChipsProps {
  topCards: MapCardEntry[]
  totalCount: number
  showCount: number
  cardTiers: Record<string, string>
  tierStyles: Record<string, TierStyle>
  hiddenCards: Record<string, boolean>
  onSelectCard: (cardName: string) => void
}

export function CardChips({
  topCards,
  totalCount,
  showCount,
  cardTiers,
  tierStyles,
  hiddenCards,
  onSelectCard,
}: CardChipsProps): JSX.Element {
  return (
    <div className="flex-1 relative z-[1]">
      <div className="text-[10px] text-text-dim flex gap-[6px] flex-wrap">
        {topCards.map((c) => {
          const tier = cardTiers[c.card.name]
          const style = tier ? tierStyles[tier] : undefined
          const isCardHidden = !!hiddenCards[c.card.name]
          return (
            <span
              key={c.card.name}
              onClick={(e) => {
                e.stopPropagation()
                onSelectCard(c.card.name)
              }}
              className="rounded-[3px] pr-[10px] pl-0 py-0 whitespace-nowrap cursor-pointer inline-flex items-center gap-2 overflow-hidden text-sm"
              style={{
                background: style?.bg ?? 'rgba(255,255,255,0.05)',
                color: style?.text ?? 'var(--text)',
                opacity: isCardHidden ? 0.5 : 1,
                border: style ? `1px solid ${style.border}` : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!style) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              }}
              onMouseLeave={(e) => {
                if (!style) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
            >
              <img
                src={`https://web.poecdn.com/image/divination-card/${c.card.art}.png`}
                alt=""
                className="self-stretch w-10 object-cover rounded-l-[2px] shrink-0 min-h-[26px]"
              />
              <span className="relative z-[1] text-inherit" style={{ fontFamily: "'Fontin SmallCaps', serif" }}>
                {c.card.name}
              </span>
            </span>
          )
        })}
        {totalCount > showCount && <span className="text-text-dim text-[9px]">+{totalCount - showCount} more</span>}
      </div>
    </div>
  )
}
