import { describe, it, expect } from 'vitest'
import { backfillPresetNames } from './regex-preset-names'
import type { RegexPreset } from '../../shared/types'

const base = (over: Partial<RegexPreset>): RegexPreset => ({
  id: 'x',
  avoid: [],
  want: [],
  wantMode: 'any',
  qualifiers: {},
  nightmare: false,
  regex: '',
  ...over,
})

describe('backfillPresetNames', () => {
  it('derives name from tags joined by spaces when name is missing', () => {
    const input = [base({ id: 'a', tags: [{ text: 'macro' }, { text: 'vendor' }] as never })]
    const { presets, changed } = backfillPresetNames(input)
    expect(changed).toBe(true)
    expect(presets[0].name).toBe('macro vendor')
  })
  it('leaves presets that already have a name untouched and reports no change', () => {
    const input = [base({ id: 'a', name: 'Keep', tags: [{ text: 'x' }] as never })]
    const { presets, changed } = backfillPresetNames(input)
    expect(changed).toBe(false)
    expect(presets[0].name).toBe('Keep')
  })
  it('omits name when there are no tags', () => {
    const input = [base({ id: 'a' })]
    const { presets, changed } = backfillPresetNames(input)
    expect(changed).toBe(false)
    expect(presets[0].name).toBeUndefined()
  })
})
