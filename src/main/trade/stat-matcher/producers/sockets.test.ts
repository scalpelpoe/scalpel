import { describe, expect, it } from 'vitest'
import { buildSocketFilters } from './sockets'

// Minimal itemInfo shape for socket tests
function makeInfo(overrides: { sockets?: string; linkedSockets?: number; itemClass?: string; runes?: string[] } = {}) {
  return {
    sockets: overrides.sockets ?? 'S S',
    linkedSockets: overrides.linkedSockets ?? 0,
    itemClass: overrides.itemClass ?? 'Boots',
    runes: overrides.runes,
  }
}

describe('buildSocketFilters - special rune deduction', () => {
  // The real bug report: a 2-socket boot carrying BOTH a warping rune AND a
  // modifier-grant rune indexes as rune_sockets 0 on trade (verified live), so the
  // chip must be dropped entirely - a min:1 chip still excludes the item's own listing.
  it('drops the chip for the real item: 2 sockets + warping + "+N Suffix Modifier allowed" -> no chip', () => {
    const filters = buildSocketFilters(
      makeInfo({ runes: ['+1 Suffix Modifier allowed', 'Can roll Chronomancy modifiers'] }),
      undefined,
    )
    expect(filters.find((f) => f.id === 'socket.rune_sockets')).toBeUndefined()
  })

  it('subtracts a modifier-grant rune: 2 sockets + "+1 Prefix Modifier allowed" -> chip min/value = 1', () => {
    const filters = buildSocketFilters(makeInfo({ runes: ['+1 Prefix Modifier allowed'] }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(1)
    expect(runeChip!.text).toBe('1 Rune Socket')
  })

  it('handles the plural "Modifiers allowed" wording too', () => {
    const filters = buildSocketFilters(
      makeInfo({ runes: ['+2 Suffix Modifiers allowed', 'Can roll Decay modifiers'] }),
      undefined,
    )
    expect(filters.find((f) => f.id === 'socket.rune_sockets')).toBeUndefined()
  })

  it('does NOT discount a normal stat rune: 2 sockets + a resistance rune -> chip min/value = 2', () => {
    const filters = buildSocketFilters(makeInfo({ runes: ['+12% to Fire Resistance'] }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(2)
    expect(runeChip!.text).toBe('2 Rune Sockets')
  })

  it('subtracts one warping rune: 2 sockets + 1 warping rune -> chip min/value = 1', () => {
    const filters = buildSocketFilters(makeInfo({ runes: ['Can roll Chronomancy modifiers'] }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(1)
    expect(runeChip!.value).toBe(1)
    expect(runeChip!.text).toBe('1 Rune Socket')
  })

  it('subtracts two warping runes: 2 sockets + 2 warping runes -> no rune-socket chip', () => {
    const filters = buildSocketFilters(
      makeInfo({ runes: ['Can roll Chronomancy modifiers', 'Can roll Decay modifiers'] }),
      undefined,
    )
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeUndefined()
  })

  it('does not discount non-warping runes (empty runes): 2 sockets + no runes -> chip min/value = 2', () => {
    const filters = buildSocketFilters(makeInfo({ runes: [] }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(2)
    expect(runeChip!.value).toBe(2)
    expect(runeChip!.text).toBe('2 Rune Sockets')
  })

  // "Can roll Ring Modifiers" is an item implicit, not a rune, and uses a capital M.
  // Feeding it via runes[] documents that the no-i-flag regex correctly excludes it.
  it('does not discount capital-M "Can roll Ring Modifiers" - it is not a warping rune', () => {
    const filters = buildSocketFilters(makeInfo({ runes: ['Can roll Ring Modifiers'] }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(2)
    expect(runeChip!.value).toBe(2)
    expect(runeChip!.text).toBe('2 Rune Sockets')
  })

  it('sanity: single socket with no runes -> chip min/value = 1', () => {
    const filters = buildSocketFilters(makeInfo({ sockets: 'S', runes: [] }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(1)
    expect(runeChip!.value).toBe(1)
    expect(runeChip!.text).toBe('1 Rune Socket')
  })

  it('runes field absent (undefined) treated as empty: 2 sockets -> chip min/value = 2', () => {
    const filters = buildSocketFilters(makeInfo({ runes: undefined }), undefined)
    const runeChip = filters.find((f) => f.id === 'socket.rune_sockets')
    expect(runeChip).toBeDefined()
    expect(runeChip!.min).toBe(2)
    expect(runeChip!.value).toBe(2)
  })
})
