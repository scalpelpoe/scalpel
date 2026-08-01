import { describe, it, expect } from 'vitest'
import { generateTabletPresetTags, type TabletTagState } from './tablet-preset-tags'
import { TABLET_MODS } from '@shared/data/regex/tablet-mods'

function emptyState(): TabletTagState {
  return {
    want: new Set<number>(),
    rarity: { normal: false, magic: false, rare: false },
    type: {
      irradiated: false,
      ritual: false,
      delirium: false,
      breach: false,
      abyss: false,
      temple: false,
      overseer: false,
    },
    uses: { enabled: false, value: 1 },
  }
}

describe('generateTabletPresetTags', () => {
  it('returns no tags for the empty default', () => {
    expect(generateTabletPresetTags(emptyState(), TABLET_MODS)).toEqual([])
  })
  it('emits a want tag (with sourceId) per selected affix using its display text', () => {
    const s = emptyState()
    s.want = new Set([TABLET_MODS[0].id])
    const tags = generateTabletPresetTags(s, TABLET_MODS)
    const affixTag = tags.find((t) => t.text === TABLET_MODS[0].text)
    expect(affixTag).toBeDefined()
    expect(affixTag?.source).toBe('want')
    expect(affixTag?.sourceId).toBe(TABLET_MODS[0].id)
  })
  it('emits qualifier tags for rarity, type, and uses', () => {
    const s = emptyState()
    s.rarity.magic = true
    s.type.breach = true
    s.uses = { enabled: true, value: 12 }
    const texts = generateTabletPresetTags(s, TABLET_MODS).map((t) => t.text)
    expect(texts).toContain('Magic')
    expect(texts).toContain('Breach')
    expect(texts).toContain('12+ uses')
  })
  it('emits a Rare tag when rare rarity is selected', () => {
    const s = emptyState()
    s.rarity.rare = true
    const texts = generateTabletPresetTags(s, TABLET_MODS).map((t) => t.text)
    expect(texts).toContain('Rare')
  })
})
