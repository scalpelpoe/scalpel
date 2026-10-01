import type { SnapshotItem } from '@scalpel/stream-contract'
import type { CSSProperties } from 'react'
import { cardToItem } from './card-item'

interface Props {
  item: SnapshotItem | undefined
  label: string
  style?: CSSProperties
  active?: boolean
  patched?: boolean
  /** Hover previews (desktop); click pins (touch and mouse). */
  onHover?: (item: SnapshotItem | null) => void
  onPin?: (item: SnapshotItem) => void
}

/** Socket centre on a 48-wide grid of 24px steps, zig-zagging down in pairs as the game
 *  lays sockets out (PoB Redux's socketPosition in src/lib/equipment.ts). */
function socketPosition(index: number, count: number): { x: number; y: number } {
  const row = Math.floor(index / 2)
  return { x: count === 1 ? 24 : 12 + (row % 2 ? 1 - (index % 2) : index % 2) * 24, y: 12 + row * 24 }
}

/** The item's runes over its art, shown while the slot is hovered or focused. */
function Runes({
  sockets,
  onHover,
  onPin,
}: {
  sockets: SnapshotItem['sockets']
  /** Called with the rune's card while hovered; null when it leaves (the slot's own hover resumes). */
  onHover?: (card: SnapshotItem | null) => void
  onPin?: (card: SnapshotItem) => void
}): JSX.Element {
  const rows = Math.ceil(sockets.length / 2)
  return (
    <span
      className="ssv-runes"
      aria-hidden
      style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, height: `min(${rows * 32}px, calc(100% - 6px))` }}
    >
      {sockets.map((socket, i) => {
        const point = socketPosition(i, sockets.length)
        const card = socket.card ? cardToItem(socket.card) : null
        return (
          <span
            key={i}
            className="ssv-rune"
            data-card={card ? '' : undefined}
            onMouseEnter={card ? () => onHover?.(card) : undefined}
            onMouseLeave={card ? () => onHover?.(null) : undefined}
            onClick={
              card
                ? (e) => {
                    e.stopPropagation()
                    onPin?.(card)
                  }
                : undefined
            }
            style={{
              gridColumn: sockets.length === 1 ? '1 / -1' : `${(point.x + 12) / 24}`,
              gridRow: `${(point.y + 12) / 24}`,
            }}
          >
            {socket.icon && <img src={socket.icon} alt="" />}
          </span>
        )
      })}
    </span>
  )
}

/** One inventory cell, styled like PoB Redux's equipment grid: rarity-tinted tile with
 *  the item art, or the slot's name when it is empty. */
export function ItemSlot({ item, label, style, active, patched, onHover, onPin }: Props): JSX.Element {
  const title = item ? `${label}: ${item.name ?? item.baseType}` : `${label}: empty`
  return (
    <button
      type="button"
      className={`ssv-slot${item ? '' : ' ssv-empty'}${active ? ' ssv-active' : ''}`}
      data-rarity={item?.rarity}
      style={style}
      aria-label={title}
      disabled={!item}
      onMouseEnter={() => item && onHover?.(item)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => item && onPin?.(item)}
    >
      {item ? <img src={item.icon} alt="" draggable={false} /> : <span className="ssv-slot-label">{label}</span>}
      {item && item.sockets.length > 0 && <Runes sockets={item.sockets} onHover={(card) => onHover?.(card ?? item)} onPin={onPin} />}
      {patched && <span className="ssv-patched" title="Just updated by the streamer" />}
    </button>
  )
}
