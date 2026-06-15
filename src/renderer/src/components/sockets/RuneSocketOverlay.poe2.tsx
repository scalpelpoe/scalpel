import socketRunePoe2 from '../../assets/sockets/socket-rune-poe2.png'
import { isSkillGem } from '@shared/poe-item'
import { getItemSize } from '../../shared/item-display'

/**
 * PoE2 rune-socket grid rendered on top of an item art tile. Consumers in
 * TradeListings (sz=12, gap=3) and ExpandedListing (sz=20, gap=5) pass in the
 * size they want. Layout matches PoE1's grid shape (column for 1-wide items or
 * a single socket, L-R-R-L zigzag for 2-wide items) so the overlay reads the
 * same across games; only the socket art and the absence of links differ.
 *
 * Skill gems are 1x2 in inventory but are forced into the 2-wide zigzag layout
 * so multi-socket gems render as a grid rather than a vertical column.
 *
 * No links, no colors: PoE2 rune sockets are always the single rune orb.
 */
export function RuneSocketOverlayPoe2({
  count,
  itemClass,
  itemName,
  sz,
  gap,
}: {
  count: number
  itemClass: string
  itemName: string
  sz: number
  gap: number
}): JSX.Element | null {
  if (count <= 0) return null
  const is1Wide = !isSkillGem({ itemClass }) && getItemSize(itemClass, itemName)[0] <= 1

  if (is1Wide || count <= 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, si) => (
          <div key={si} className="flex flex-col items-center">
            {si > 0 && <div style={{ height: gap }} />}
            <img src={socketRunePoe2} alt="" style={{ width: sz, height: sz }} />
          </div>
        ))}
      </>
    )
  }

  const positions: Array<[number, number]> = []
  for (let row = 0; row < Math.ceil(count / 2); row++) {
    if (row % 2 === 0) {
      positions.push([0, row])
      if (positions.length < count) positions.push([1, row])
    } else {
      positions.push([1, row])
      if (positions.length < count) positions.push([0, row])
    }
  }

  const cellW = sz + gap * 2
  const cellH = sz + gap * 2
  const totalW = cellW * 2
  const totalH = cellH * Math.ceil(count / 2)

  return (
    <div className="relative overflow-visible" style={{ width: totalW, height: totalH }}>
      {positions.map(([col, row], si) => (
        <img
          key={si}
          src={socketRunePoe2}
          alt=""
          style={{
            position: 'absolute',
            left: col * cellW + gap,
            top: row * cellH + gap,
            width: sz,
            height: sz,
          }}
        />
      ))}
    </div>
  )
}
