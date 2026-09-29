import { describe, expect, it } from 'vitest'
import type { RegexPreset } from '@shared/types'
import { applyGroupOrder, generatorOf } from './preset-order'

function preset(id: string, generator?: string): RegexPreset {
  return {
    id,
    name: id,
    generator,
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: {},
    nightmare: false,
    regex: 'aaa',
  }
}

describe('generatorOf', () => {
  it('defaults presets with no generator to maps', () => {
    expect(generatorOf(preset('p1'))).toBe('maps')
    expect(generatorOf(preset('p2', 'custom'))).toBe('custom')
  })
})

describe('applyGroupOrder', () => {
  it('reorders one group and returns the full id list', () => {
    const all = [preset('m1', 'maps'), preset('m2', 'maps'), preset('m3', 'maps')]
    expect(applyGroupOrder(all, 'maps', ['m3', 'm1', 'm2'])).toEqual(['m3', 'm1', 'm2'])
  })

  it('keeps presets from other groups in their original slots', () => {
    // Interleaved on purpose: the maps entries must land back in slots 0/2/3
    // without disturbing the custom ones around them.
    const all = [
      preset('m1', 'maps'),
      preset('c1', 'custom'),
      preset('m2', 'maps'),
      preset('m3', 'maps'),
      preset('c2', 'custom'),
    ]
    expect(applyGroupOrder(all, 'maps', ['m3', 'm2', 'm1'])).toEqual(['m3', 'c1', 'm2', 'm1', 'c2'])
  })

  it('never drops or duplicates a preset when the dragged order is short or has strays', () => {
    const all = [preset('m1', 'maps'), preset('m2', 'maps'), preset('c1', 'custom')]
    // 'c1' is another group and 'zz' doesn't exist: both ignored. 'm1' was left
    // out of the payload, so it gets appended rather than lost.
    expect(applyGroupOrder(all, 'maps', ['m2', 'c1', 'zz'])).toEqual(['m2', 'm1', 'c1'])
  })

  it('collapses duplicate ids instead of cloning a preset over another slot', () => {
    const all = [preset('m1', 'maps'), preset('m2', 'maps')]
    expect(applyGroupOrder(all, 'maps', ['m2', 'm2'])).toEqual(['m2', 'm1'])
  })

  it('treats a generator-less preset as part of the maps group', () => {
    const all = [preset('legacy'), preset('m1', 'maps')]
    expect(applyGroupOrder(all, 'maps', ['m1', 'legacy'])).toEqual(['m1', 'legacy'])
  })

  it('returns the list unchanged for a group with no members', () => {
    const all = [preset('m1', 'maps'), preset('c1', 'custom')]
    expect(applyGroupOrder(all, 'flasks', [])).toEqual(['m1', 'c1'])
  })
})
