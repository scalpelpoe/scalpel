import { describe, expect, it } from 'vitest'
import { toggleFilterAt } from './toggle-filter'
import type { StatFilter } from './types'

const row = (over: Partial<StatFilter>): StatFilter => ({
  id: 'explicit.stat_life',
  text: '+80 to maximum Life',
  value: 80,
  min: 80,
  max: null,
  enabled: true,
  type: 'explicit',
  ...over,
})

const SKILL = 'mercenary.skill_37202'

describe('toggleFilterAt', () => {
  it('flips the targeted row', () => {
    const out = toggleFilterAt([row({ enabled: true })], 0)

    expect(out[0].enabled).toBe(false)
  })

  it('leaves ternary chips to their own chipState path', () => {
    const filters = [row({ id: 'misc.corrupted', type: 'misc', enabled: false })]

    expect(toggleFilterAt(filters, 0)).toBe(filters)
  })

  it('takes a mercenary skill’s supports down with it', () => {
    const filters = [
      row({ id: SKILL, text: 'Bladefall', type: 'mercenary', enabled: true }),
      row({ id: 'mercenary.support_8607', type: 'mercenary', enabled: true, mercenarySkillId: SKILL }),
      row({ id: 'mercenary.support_53342', type: 'mercenary', enabled: true, mercenarySkillId: SKILL }),
      // Another skill's support stays put.
      row({
        id: 'mercenary.support_61471',
        type: 'mercenary',
        enabled: true,
        mercenarySkillId: 'mercenary.skill_2792',
      }),
    ]

    const out = toggleFilterAt(filters, 0)

    expect(out.map((f) => f.enabled)).toEqual([false, false, false, true])
  })

  it('does not restore the supports when the skill comes back on', () => {
    // They were switched off with the skill; re-enabling must not resurrect picks
    // the user may have cleared deliberately.
    const filters = [
      row({ id: SKILL, text: 'Bladefall', type: 'mercenary', enabled: false }),
      row({ id: 'mercenary.support_8607', type: 'mercenary', enabled: false, mercenarySkillId: SKILL }),
    ]

    const out = toggleFilterAt(filters, 0)

    expect(out.map((f) => f.enabled)).toEqual([true, false])
  })

  it('leaves the skill alone when one of its supports is toggled', () => {
    const filters = [
      row({ id: SKILL, text: 'Bladefall', type: 'mercenary', enabled: true }),
      row({ id: 'mercenary.support_8607', type: 'mercenary', enabled: true, mercenarySkillId: SKILL }),
    ]

    const out = toggleFilterAt(filters, 1)

    expect(out.map((f) => f.enabled)).toEqual([true, false])
  })

  it('keeps timeless chips mutually exclusive', () => {
    const filters = [
      row({ id: 'timeless-any', type: 'timeless', enabled: true }),
      row({ id: 'timeless-any-seed', type: 'timeless', enabled: false }),
      row({ id: 'explicit.pseudo_timeless_jewel_kaom', type: 'timeless', enabled: false }),
    ]

    const anySeed = toggleFilterAt(filters, 1)
    expect(anySeed.map((f) => f.enabled)).toEqual([false, true, false])
    expect(toggleFilterAt(anySeed, 2).map((f) => f.enabled)).toEqual([false, false, true])
  })

  it('flips the Fractured chip to yes when a fractured row is enabled', () => {
    const filters = [
      row({ type: 'fractured', enabled: false }),
      row({ id: 'misc.fractured', type: 'misc', enabled: false }),
    ]

    const out = toggleFilterAt(filters, 0)

    expect(out[1].chipState).toBe('yes')
  })
})
