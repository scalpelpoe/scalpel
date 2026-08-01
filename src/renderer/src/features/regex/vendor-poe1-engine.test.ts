import { describe, expect, it } from 'vitest'
import { DEFAULT_VENDOR_POE1_SETTINGS, type VendorPoe1Settings } from '@shared/data/regex/vendor-poe1-toggles'
import { regexGems } from '@shared/data/regex/vendor/gems/Generated.Gems.English'
import { buildVendorPoe1GroupsRegex, buildVendorPoe1Regex, buildVendorPoe1Warnings } from './vendor-poe1-engine'
import { generateResultString, type PoeStringSettings } from './__fixtures__/poere/OutputString'

function empty(): VendorPoe1Settings {
  return structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)
}

/** Map our flattened settings onto upstream's PoeStringSettings (specLink is the
 *  dropped "Other Links" feature - always off). */
function adapt(s: VendorPoe1Settings): PoeStringSettings {
  return {
    anyThreeLink: s.links.any3,
    anyFourLink: s.links.any4,
    anyFiveLink: s.links.any5,
    anySixLink: s.links.any6,
    anySixSocket: s.links.socket6,
    movement: { ten: s.movement.ten, fifteen: s.movement.fifteen },
    colors: {
      ...s.colors3,
      ...s.colors2,
      specLink: false,
      specLinkColors: { r: undefined, g: undefined, b: undefined },
    },
    plusGems: { ...s.plusGems },
    damage: { ...s.damage },
    weapon: { ...s.weapon },
    gems: [...s.gems],
  }
}

function expectParity(s: VendorPoe1Settings): void {
  expect(buildVendorPoe1Regex(s)).toBe(generateResultString(adapt(s)))
}

describe('targeted parity with poe.re', () => {
  it('empty settings produce an empty string', () => {
    expect(buildVendorPoe1Regex(empty())).toBe('')
    expectParity(empty())
  })

  it('any-link and socket toggles', () => {
    for (const field of ['any3', 'any4', 'any5', 'any6', 'socket6'] as const) {
      const s = empty()
      s.links[field] = true
      expectParity(s)
    }
    const all = empty()
    all.links = { any3: true, any4: true, any5: true, any6: true, socket6: true }
    expectParity(all)
  })

  it('each 3L color toggle individually', () => {
    for (const field of Object.keys(empty().colors3)) {
      const s = empty()
      ;(s.colors3 as Record<string, boolean>)[field] = true
      expectParity(s)
    }
  })

  it('each 2L color toggle individually', () => {
    for (const field of Object.keys(empty().colors2)) {
      const s = empty()
      ;(s.colors2 as Record<string, boolean>)[field] = true
      expectParity(s)
    }
  })

  it('the full ABABAB collapse and other simplify passes', () => {
    const s = empty()
    s.colors3 = { ...s.colors3, rrr: true, ggg: true, rrg: true, ggr: true }
    expectParity(s)
    const t = empty()
    t.colors3 = {
      ...t.colors3,
      rrr: true,
      ggg: true,
      bbb: true,
      rrg: true,
      rrb: true,
      ggr: true,
      ggb: true,
      bbr: true,
      bbg: true,
    }
    expectParity(t)
  })

  it('movement, plus-gems (including the all-five collapse), damage, weapons', () => {
    const s = empty()
    s.movement = { ten: true, fifteen: true }
    expectParity(s)
    const g = empty()
    g.plusGems = { any: false, lightning: true, fire: true, cold: true, phys: true, chaos: true }
    expectParity(g) // collapses to the quoted "ll g" wand term
    const d = empty()
    d.damage = { phys: true, firemult: true, coldmult: true, chaosmult: true }
    expectParity(d)
    const w1 = empty()
    w1.weapon.axe = true
    expectParity(w1) // single: s:.+ax
    const w2 = empty()
    w2.weapon.axe = true
    w2.weapon.sword = true
    expectParity(w2) // multi: s:.+(ax|sw)
  })

  it('gems, including the quote-wrap when a gem regex contains a space', () => {
    const inHo = regexGems.tokens.find((t) => t.regex === 'in ho')
    const pie = regexGems.tokens.find((t) => t.regex === '^pie')
    expect(inHo).toBeDefined()
    expect(pie).toBeDefined()
    const s = empty()
    s.gems = [pie!.id]
    expectParity(s)
    const t = empty()
    t.gems = [inHo!.id, pie!.id]
    expectParity(t) // 'in ho' contains a space -> whole result gets quote-wrapped
  })
})

describe('seeded random parity sweep', () => {
  function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('matches upstream across 500 random settings combinations', () => {
    const rand = mulberry32(0x5ca19e1)
    for (let i = 0; i < 500; i++) {
      const s = empty()
      for (const group of ['links', 'colors3', 'colors2', 'movement', 'plusGems', 'damage', 'weapon'] as const) {
        const obj = s[group] as Record<string, boolean>
        for (const field of Object.keys(obj)) obj[field] = rand() < 0.2
      }
      const gemCount = Math.floor(rand() * 4)
      for (let g = 0; g < gemCount; g++) {
        s.gems.push(regexGems.tokens[Math.floor(rand() * regexGems.tokens.length)].id)
      }
      expect(buildVendorPoe1Regex(s), `iteration ${i}: ${JSON.stringify(s)}`).toBe(generateResultString(adapt(s)))
    }
  })
})

describe('groups and warnings (Scalpel extensions over poe.re)', () => {
  it('joins non-empty group terms with a space and drops empty groups', () => {
    const a = empty()
    a.links.any4 = true
    const b = empty()
    b.colors2.rr = true
    expect(buildVendorPoe1GroupsRegex([a, empty(), b])).toBe('-\\w-.- r-r')
    expect(buildVendorPoe1GroupsRegex([empty()])).toBe('')
  })

  it('reports the three upstream conflicts, deduplicated across groups', () => {
    const wand = empty()
    wand.plusGems.fire = true
    wand.weapon.wand = true
    expect(buildVendorPoe1Warnings([wand])).toBe('All wands will be displayed [conflict: +1 wand & weapon base=wand].')
    const gemsVsWeapon = empty()
    gemsVsWeapon.gems = [regexGems.tokens[0].id]
    gemsVsWeapon.weapon.axe = true
    expect(buildVendorPoe1Warnings([gemsVsWeapon])).toBe(
      'Undesired gems will be displayed [conflict: weapon types & vendor gems]',
    )
    const gemsVsPhys = empty()
    gemsVsPhys.gems = [regexGems.tokens[0].id]
    gemsVsPhys.damage.phys = true
    expect(buildVendorPoe1Warnings([gemsVsPhys])).toBe(
      'Heavy Strike will be displayed [conflict: phys damage & vendor gems]',
    )
    expect(buildVendorPoe1Warnings([wand, structuredClone(wand)])).toBe(
      'All wands will be displayed [conflict: +1 wand & weapon base=wand].',
    )
    expect(buildVendorPoe1Warnings([empty()])).toBeNull()
  })
})
