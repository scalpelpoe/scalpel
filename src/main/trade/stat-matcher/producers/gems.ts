import { getPoeVersion } from '@main/game-state'
import { SKILL_GEM_CLASSES } from '@shared/poe-item'
import type { StatFilter } from '../../trade'

type GemItemInfo = {
  itemClass: string
  gemLevel: number
  quality: number
  transfigured?: boolean
  sockets: string
}

// Gem level, transfigured, and gem-quality chips (gem items only).
export function buildGemFilters(itemInfo: GemItemInfo | undefined): StatFilter[] {
  if (!itemInfo) return []

  const isGem = SKILL_GEM_CLASSES.has(itemInfo.itemClass)
  if (!isGem) return []

  const out: StatFilter[] = []

  if (itemInfo.gemLevel > 0) {
    // Gem level as adjustable row with exact min/max
    out.push({
      id: 'misc.gem_level',
      text: `Gem Level: ${itemInfo.gemLevel}`,
      value: itemInfo.gemLevel,
      min: itemInfo.gemLevel,
      max: null,
      enabled: true,
      type: 'gem',
    })
  }

  // PoE2 has no transfigured gems (yet), so the chip is PoE1-only noise there.
  if (getPoeVersion() === 1) {
    out.push({
      id: 'misc.gem_transfigured',
      text: 'Transfigured',
      value: null,
      min: null,
      max: null,
      enabled: !!itemInfo.transfigured,
      type: 'gem',
    })
  }

  // PoE2 support-socket count segments gem prices (5-socket premium). The trade2
  // misc filter key is gem_sockets. Token counting is letter-agnostic because the
  // socket letter (B/G/R/S) is not load-bearing for this filter.
  if (getPoeVersion() === 2) {
    const socketCount = itemInfo.sockets
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean).length
    if (socketCount > 0) {
      out.push({
        id: 'misc.gem_sockets',
        text: `Sockets: ${socketCount}`,
        value: socketCount,
        min: socketCount,
        max: null,
        enabled: true,
        type: 'gem',
      })
    }
  }

  // Always surface a gem-quality row, even at 0% -- a no-quality gem shows the
  // row toggled off with an empty value so the user can dial one in. Auto-enabled
  // only at >=20% (the common "20q" search).
  const hasQuality = itemInfo.quality > 0
  out.push({
    id: 'misc.quality',
    text: hasQuality ? `Quality: ${itemInfo.quality}%` : 'Quality',
    value: hasQuality ? itemInfo.quality : null,
    min: hasQuality ? itemInfo.quality : null,
    max: null,
    enabled: hasQuality && itemInfo.quality >= 20,
    type: 'gem',
  })

  return out
}
