import { describe, it, expect } from 'vitest'
import { hasLearnedPreference, learnedMenuEntries } from './learned-preference-menu'

const explicit = { id: 'explicit.life', type: 'explicit' }

describe('hasLearnedPreference', () => {
  it('reads the session-start decisions map', () => {
    expect(hasLearnedPreference('explicit.life', { 'explicit.life': true }, {})).toBe(true)
    expect(hasLearnedPreference('explicit.life', {}, {})).toBe(false)
  })

  it('a mid-session set/unset overrides the stale session-start map', () => {
    expect(hasLearnedPreference('explicit.life', {}, { 'explicit.life': 'set' })).toBe(true)
    expect(hasLearnedPreference('explicit.life', { 'explicit.life': true }, { 'explicit.life': 'unset' })).toBe(false)
  })
})

describe('learnedMenuEntries', () => {
  it('non-learnable rows get no menu', () => {
    expect(learnedMenuEntries({ id: 'misc.quality', type: 'misc' }, {}, {})).toEqual([])
  })

  it('learnable row without a preference offers Set only', () => {
    expect(learnedMenuEntries(explicit, {}, {})).toEqual([{ kind: 'set', label: 'Set as Learned Preference' }])
  })

  it('learnable row with a preference offers Set and Unset', () => {
    expect(learnedMenuEntries(explicit, { 'explicit.life': false }, {})).toEqual([
      { kind: 'set', label: 'Set as Learned Preference' },
      { kind: 'unset', label: 'Unset Learned Preference' },
    ])
  })

  it('unsetting mid-session removes the Unset entry on re-open', () => {
    expect(learnedMenuEntries(explicit, { 'explicit.life': false }, { 'explicit.life': 'unset' })).toEqual([
      { kind: 'set', label: 'Set as Learned Preference' },
    ])
  })
})
