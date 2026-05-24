import { ATZOATL_KEY_ROOMS, ATZOATL_ROOMS } from '../../../../shared/data/trade/atzoatl'
import type { StatFilter } from '../../trade'

type AtzoatlItemInfo = {
  atzoatlRooms?: string[]
  atzoatlOpenCount?: number
}

// Chronicle of Atzoatl room chips
export function buildAtzoatlFilters(itemInfo: AtzoatlItemInfo | undefined): StatFilter[] {
  const out: StatFilter[] = []

  if (itemInfo?.atzoatlRooms && itemInfo.atzoatlRooms.length > 0) {
    const openCount = itemInfo.atzoatlOpenCount ?? itemInfo.atzoatlRooms.length
    itemInfo.atzoatlRooms.forEach((room, i) => {
      const statId = ATZOATL_ROOMS[room]
      if (!statId) return
      const isOpen = i < openCount
      const isKey = ATZOATL_KEY_ROOMS.has(room)
      const label = isOpen ? `Open Room: ${room}` : `Obstructed: ${room}`
      out.push({
        id: statId,
        text: label,
        value: null,
        min: null,
        max: null,
        enabled: isOpen && isKey,
        type: isKey ? 'temple-key' : 'temple',
        option: isOpen ? 1 : 2,
      })
    })
  }

  return out
}
