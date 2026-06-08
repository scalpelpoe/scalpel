import { describe, it, expect } from 'vitest'
import { generateRelicPresetTags } from './relic-preset-tags'
import { RELIC_MODS } from '../../../../shared/data/regex/relic-mods'

describe('generateRelicPresetTags', () => {
  it('returns no tags for an empty any-mode selection', () => {
    expect(generateRelicPresetTags({ want: new Set(), wantValues: {}, matchType: 'any' })).toEqual([])
  })

  it('adds a match:both tag in both mode', () => {
    const tags = generateRelicPresetTags({ want: new Set(), wantValues: {}, matchType: 'both' })
    expect(tags.map((t) => t.text)).toContain('match:both')
  })

  it('emits one want-sourced tag per selected mod', () => {
    const id = RELIC_MODS[0].id
    const tags = generateRelicPresetTags({ want: new Set([id]), wantValues: {}, matchType: 'any' })
    const modTags = tags.filter((t) => t.source === 'want')
    expect(modTags).toHaveLength(1)
    expect(modTags[0].sourceId).toBe(id)
  })

  it('appends >=value when a magnitude is set', () => {
    const id = RELIC_MODS[0].id
    const tags = generateRelicPresetTags({ want: new Set([id]), wantValues: { [id]: 12 }, matchType: 'any' })
    const modTag = tags.find((t) => t.source === 'want')
    expect(modTag?.text.endsWith('>=12')).toBe(true)
  })

  it('emits both the match:both tag and a mod tag when both are active', () => {
    const id = RELIC_MODS[0].id
    const tags = generateRelicPresetTags({ want: new Set([id]), wantValues: {}, matchType: 'both' })
    expect(tags.map((t) => t.text)).toContain('match:both')
    expect(tags.filter((t) => t.source === 'want')).toHaveLength(1)
  })
})

describe('relic mod tag labels', () => {
  it('produces a distinct label for every relic mod', () => {
    const labels = RELIC_MODS.map((m) => {
      const tags = generateRelicPresetTags({ want: new Set([m.id]), wantValues: {}, matchType: 'any' })
      return tags.find((t) => t.source === 'want')?.text
    })
    const unique = new Set(labels)
    expect(unique.size).toBe(RELIC_MODS.length)
  })
})
