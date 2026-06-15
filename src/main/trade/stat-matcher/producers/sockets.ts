import type { AdvancedMod } from '@shared/types'
import type { StatFilter } from '../../trade'
import { SKILL_GEM_CLASSES } from '@shared/poe-item'

type SocketItemInfo = {
  sockets: string
  linkedSockets: number
  itemClass: string
}

// Socket chips: rune sockets (PoE2), white sockets, abyssal sockets, links
export function buildSocketFilters(
  itemInfo: SocketItemInfo | undefined,
  advancedMods: AdvancedMod[] | undefined,
): StatFilter[] {
  if (!itemInfo) return []

  // Gems are not socketable items in either game -- PoE1 gems have no sockets;
  // PoE2 gem sockets are support slots handled by the gems producer. Skip here
  // to avoid emitting bogus rune-socket chips for support-gem socket lines.
  if (SKILL_GEM_CLASSES.has(itemInfo.itemClass)) return []

  const out: StatFilter[] = []

  // Parse socket colors
  const socketStr = itemInfo.sockets.replace(/[-\s]/g, '')
  const w = (socketStr.match(/W/g) ?? []).length
  const a = (socketStr.match(/A/g) ?? []).length
  const s = (socketStr.match(/S/g) ?? []).length // PoE2 rune sockets

  // PoE2 rune sockets: one chip per item with min = current count. Rune-socket count
  // is load-bearing for PoE2 (2-socket body armours trade at a premium); enabled by
  // default so searches narrow to "at least this many" unless the user turns it off.
  if (s > 0) {
    out.push({
      id: 'socket.rune_sockets',
      text: `${s} Rune Socket${s === 1 ? '' : 's'}`,
      value: s,
      min: s,
      max: null,
      enabled: true,
      type: 'socket',
    })
  }

  // White sockets chip goes into filters (type: 'explicit') -- preserved quirk from
  // the original inline block. Returned here so the orchestrator can spread it into
  // the right array.
  // NOTE: callers must spread the white-sockets entry into the `filters` array (not
  // miscFilters) to match original behavior. The chip is returned as a normal entry;
  // the caller is responsible for routing it.
  if (w > 0) {
    out.push({
      id: 'socket.white_sockets',
      text: 'White Sockets',
      value: w,
      min: w,
      max: null,
      enabled: false,
      type: 'explicit',
    })
  }

  if (a > 0) {
    const abyssIsImplicit =
      !advancedMods ||
      advancedMods.some((am) => am.type === 'implicit' && am.lines.some((l) => /Abyssal Socket/i.test(l)))
    out.push({
      id: `${abyssIsImplicit ? 'implicit' : 'explicit'}.stat_3527617737`,
      text: 'Abyssal Sockets',
      value: a,
      min: a,
      max: null,
      enabled: true,
      type: abyssIsImplicit ? 'implicit' : 'explicit',
    })
  }

  if (itemInfo.linkedSockets >= 5) {
    out.push({
      id: 'socket.links',
      text: `${itemInfo.linkedSockets}L`,
      value: itemInfo.linkedSockets,
      min: itemInfo.linkedSockets,
      max: null,
      enabled: true,
      type: 'socket',
    })
  }

  return out
}
