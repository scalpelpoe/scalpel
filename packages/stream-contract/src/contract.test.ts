import { describe, expect, it } from 'vitest'
import sample from '../fixtures/sample-snapshot.json'
import {
  countItems,
  EquipmentSchema,
  LIMITS,
  PairingCodeSchema,
  PubSubMessageSchema,
  paths,
  SLOTS,
  StreamHeadSchema,
  validateSnapshot,
} from './index'

// biome-ignore lint/suspicious/noExplicitAny: tests mutate the fixture freely
const fresh = (): any => structuredClone(sample)

describe('validateSnapshot', () => {
  it('accepts the sample snapshot', () => {
    const result = validateSnapshot(sample)
    expect(result.ok).toBe(true)
  })

  it('accepts the raw JSON body', () => {
    expect(validateSnapshot(JSON.stringify(sample)).ok).toBe(true)
  })

  it('round-trips a desecrated line and still parses lines without the flag', () => {
    const s = fresh()
    const helm = s.equipment.Helm as { sections: { kind: string; lines: object[] }[] }
    helm.sections.push({ kind: 'explicit', lines: [{ text: 'a', desecrated: true }, { text: 'b' }] })
    const rt = validateSnapshot(s)
    expect(rt.ok).toBe(true)
    if (rt.ok) {
      const lines = rt.snapshot.equipment.Helm?.sections.at(-1)?.lines
      expect(lines?.[0].desecrated).toBe(true)
      expect(lines?.[1].desecrated).toBeUndefined()
    }
    helm.sections.push({ kind: 'explicit', lines: [{ text: 'c', desecrated: false }] })
    expect(validateSnapshot(s).ok).toBe(false)
  })

  it('accepts streamer links and snapshots published before links existed', () => {
    const s = fresh()
    expect(s.links).toBeUndefined()
    expect(validateSnapshot(s).ok).toBe(true)
    s.links = {
      filters: 'https://www.pathofexile.com/account/view-profile/Name-1234/item-filters',
      buildGuide: 'https://youtu.be/abc',
    }
    expect(validateSnapshot(s).ok).toBe(true)
    s.links = { filters: null, buildGuide: null }
    expect(validateSnapshot(s).ok).toBe(true)
  })

  describe('theme', () => {
    const palette = {
      bgSolid: '#0b0e1a',
      bgCard: '#141a2e',
      accent: '#c8a45a',
      match: '#5ad1ff',
      secondaryMatch: '#a78bfa',
      text: '#e6e8f0',
      textDim: '#8a90a6',
      border: '#2a3350',
      danger: '#ef4444',
      warn: '#f59e0b',
      dangerBg: '#3b1212',
      hideColor: '#6b7280',
      showColor: '#22c55e',
      minimalColor: '#3b82f6',
    }

    it('round-trips a theme and still parses snapshots without one', () => {
      const s = fresh()
      expect(s.theme).toBeUndefined()
      expect(validateSnapshot(s).ok).toBe(true)
      s.theme = palette
      const r = validateSnapshot(JSON.parse(JSON.stringify(s)))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.snapshot.theme).toEqual(palette)
    })

    it('rejects a bad hex and an extra key', () => {
      const bad = fresh()
      bad.theme = { ...palette, accent: 'red' }
      expect(validateSnapshot(bad).ok).toBe(false)
      const short = fresh()
      short.theme = { ...palette, accent: '#fff' }
      expect(validateSnapshot(short).ok).toBe(false)
      const extra = fresh()
      extra.theme = { ...palette, glow: '#ffffff' }
      expect(validateSnapshot(extra).ok).toBe(false)
      const missing = fresh()
      const { accent: _a, ...rest } = palette
      missing.theme = rest
      expect(validateSnapshot(missing).ok).toBe(false)
    })
  })

  it('rejects a filters link off pathofexile.com and a non-web build guide', () => {
    const s = fresh()
    s.links = { filters: 'https://example.com/filters', buildGuide: null }
    expect(validateSnapshot(s).ok).toBe(false)
    s.links = { filters: null, buildGuide: 'javascript:alert(1)' }
    expect(validateSnapshot(s).ok).toBe(false)
  })

  it('accepts items with and without priceCheck, and rejects bad ones', () => {
    const s = fresh()
    expect(s.equipment.Helm.priceCheck).toBeUndefined()
    expect(validateSnapshot(s).ok).toBe(true)
    const row = {
      id: 'explicit.stat_1',
      text: '+# to maximum Life',
      type: 'explicit',
      value: 80,
      min: 72,
      max: null,
      modTier: 2,
      modRange: { min: 70, max: 90 },
      defaultEnabled: true,
      locked: false,
      offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }],
      minPath: ['query', 'stats', 0, 'filters', 0, 'value', 'min'],
      maxPath: null,
    }
    s.equipment.Helm.priceCheck = { league: 'Standard', body: { query: {}, sort: { price: 'asc' } }, rows: [row] }
    expect(validateSnapshot(s).ok).toBe(true)
    const rt = validateSnapshot(s)
    if (rt.ok) expect(rt.snapshot.equipment.Helm?.priceCheck?.rows[0]).toEqual(row)
    s.equipment.Helm.priceCheck.rows = Array.from({ length: 41 }, () => row)
    expect(validateSnapshot(s).ok).toBe(false)
    s.equipment.Helm.priceCheck.rows = [{ ...row, offOps: [{ op: 'replace', path: [] }] }]
    expect(validateSnapshot(s).ok).toBe(false)
  })

  const pcRow = {
    id: 'misc.corrupted',
    text: 'Corrupted',
    type: 'misc',
    value: null,
    min: null,
    max: null,
    defaultEnabled: true,
    locked: false,
    offOps: [],
    minPath: null,
    maxPath: null,
  }
  const withRow = (row: unknown) => {
    const s = fresh()
    s.equipment.Helm.priceCheck = { league: 'Standard', body: { query: {}, sort: { price: 'asc' } }, rows: [row] }
    return s
  }

  it('round-trips a set op', () => {
    const value = { filters: { corrupted: { option: 'true' } } }
    const set = { op: 'set', path: ['query', 'filters', 'misc_filters'], value }
    const rt = validateSnapshot(withRow({ ...pcRow, offOps: [set] }))
    expect(rt.ok).toBe(true)
    if (rt.ok) expect(rt.snapshot.equipment.Helm?.priceCheck?.rows[0].offOps).toEqual([set])
    expect(validateSnapshot(withRow({ ...pcRow, offOps: [{ op: 'set', path: ['a'] }] })).ok).toBe(false)
    expect(validateSnapshot(withRow({ ...pcRow, offOps: [{ op: 'delete', path: ['a'], value: 1 }] })).ok).toBe(false)
  })

  it('round-trips a chip row', () => {
    const chip = {
      mode: 'yesno',
      default: 'no',
      states: {
        no: [],
        yes: [{ op: 'set', path: ['query', 'filters', 'misc_filters', 'filters', 'corrupted', 'option'], value: 'true' }],
        none: [{ op: 'delete', path: ['query', 'filters', 'misc_filters', 'filters', 'corrupted'] }],
      },
    }
    const rt = validateSnapshot(withRow({ ...pcRow, chip }))
    expect(rt.ok).toBe(true)
    if (rt.ok) expect(rt.snapshot.equipment.Helm?.priceCheck?.rows[0].chip).toEqual(chip)
    expect(validateSnapshot(withRow({ ...pcRow, chip: { ...chip, mode: 'ternary' } })).ok).toBe(false)
    expect(validateSnapshot(withRow({ ...pcRow, chip: { ...chip, states: { maybe: [] } } })).ok).toBe(false)
    expect(validateSnapshot(withRow({ ...pcRow, chip: { ...chip, extra: 1 } })).ok).toBe(false)
  })

  it('rejects chips with a state outside their mode or a default missing from states', () => {
    const chip = (mode: string, def: string, states: string[]): unknown => ({
      mode,
      default: def,
      states: Object.fromEntries(states.map((k) => [k, []])),
    })
    const ok = (c: unknown): boolean => validateSnapshot(withRow({ ...pcRow, chip: c })).ok
    expect(ok(chip('yesno', 'no', ['no', 'yes', 'none']))).toBe(true)
    expect(ok(chip('minmax', 'none', ['none', 'min', 'max']))).toBe(true)
    expect(ok(chip('yesno', 'min', ['min', 'yes']))).toBe(false)
    expect(ok(chip('yesno', 'no', ['no', 'max']))).toBe(false)
    expect(ok(chip('minmax', 'yes', ['yes', 'min']))).toBe(false)
    expect(ok(chip('minmax', 'none', ['none', 'no']))).toBe(false)
    expect(ok(chip('yesno', 'yes', ['no', 'none']))).toBe(false)
  })

  it('still parses a 0.3.0-shaped price-check row (no chip field)', () => {
    const rt = validateSnapshot(withRow(pcRow))
    expect(rt.ok).toBe(true)
    if (rt.ok) expect(rt.snapshot.equipment.Helm?.priceCheck?.rows[0].chip).toBeUndefined()
  })

  it('rejects item art off the poecdn host', () => {
    const s = fresh()
    s.equipment.Helm.icon = 'https://example.com/helm.png'
    const result = validateSnapshot(s)
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    if (!result.ok) expect(result.issues.join('\n')).toContain('equipment.Helm.icon')
  })

  it('carries keystone art and text, with art only from the allowed hosts', () => {
    const s = fresh()
    expect(s.keystones[0]).toMatchObject({ name: 'Resonance', icon: expect.stringMatching(/^https:\/\/assets\.poe\.ninja\//) })
    expect(s.keystones[0].stats.length).toBeGreaterThan(0)
    s.keystones[0].icon = 'https://example.com/resonance.webp'
    const result = validateSnapshot(s)
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    if (!result.ok) expect(result.issues.join('\n')).toContain('keystones.0.icon')
  })

  it('rejects socket art off the poecdn host', () => {
    const s = fresh()
    s.equipment.Helm.sockets[0].icon = 'http://web.poecdn.com/insecure.png'
    expect(validateSnapshot(s)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('rejects unknown equipment slots and unknown keys', () => {
    const slot = fresh()
    slot.equipment.Trinket = slot.equipment.Helm
    expect(validateSnapshot(slot)).toMatchObject({ ok: false, reason: 'invalid' })

    const key = fresh()
    key.extra = true
    expect(validateSnapshot(key)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('rejects oversized bodies before parsing them', () => {
    const body = JSON.stringify({ ...sample, pad: 'x'.repeat(LIMITS.snapshotBytes) })
    expect(validateSnapshot(body)).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('rejects more items than the limit', () => {
    const s = fresh()
    s.jewels = Array.from({ length: LIMITS.items }, () => s.jewels[0])
    expect(countItems(s)).toBeGreaterThan(LIMITS.items)
    expect(validateSnapshot(s)).toMatchObject({ ok: false, reason: 'too-many-items' })
  })

  it('rejects malformed JSON', () => {
    expect(validateSnapshot('{"schema":1,')).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('caps the PoB code length', () => {
    const s = fresh()
    s.pob = 'x'.repeat(LIMITS.pob + 1)
    expect(validateSnapshot(s)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('accepts a hidden character name', () => {
    const s = fresh()
    s.character.name = null
    expect(validateSnapshot(s).ok).toBe(true)
  })
})

describe('schemas', () => {
  it('equipment keys are exactly the slots', () => {
    expect(Object.keys(EquipmentSchema.shape)).toEqual([...SLOTS])
  })

  it('pairing codes use the unambiguous alphabet', () => {
    expect(PairingCodeSchema.safeParse('AB3D5F7H').success).toBe(true)
    expect(PairingCodeSchema.safeParse('AB0D5F7H').success).toBe(false)
    expect(PairingCodeSchema.safeParse('ab3d5f7h').success).toBe(false)
    expect(PairingCodeSchema.safeParse('AB3D5F7').success).toBe(false)
  })

  it('parses heads and pubsub messages', () => {
    const head = { profileId: 'p1', version: 3, publishedUtc: '2026-09-29T12:10:05Z', state: 'live', displayName: null }
    expect(StreamHeadSchema.safeParse(head).success).toBe(true)
    expect(PubSubMessageSchema.safeParse({ t: 's', v: 3 }).success).toBe(true)
    expect(PubSubMessageSchema.safeParse({ t: 's', v: -1 }).success).toBe(false)
  })
})

describe('paths', () => {
  it('encodes path segments', () => {
    expect(paths.headBySlug('a b/c')).toBe('/v1/heads/slug/a%20b%2Fc')
    expect(paths.snapshotVersion('p1', 7)).toBe('/v1/snapshots/p1/7')
    expect(paths.headByProfile('p1')).toBe('/v1/heads/profile/p1')
  })
})

describe('gem and rune cards', () => {
  const card = {
    name: "Kolr's Hunt",
    baseType: "Kolr's Hunt",
    rarity: 'currency',
    icon: 'https://web.poecdn.com/x.png',
    properties: [{ name: 'Limited to', value: '1' }],
    requirements: [],
    sections: [{ kind: 'explicit', lines: [{ text: 'Gloves: Can roll Marksman modifiers' }] }],
  }

  it('still parses snapshots without any card', () => {
    expect(validateSnapshot(fresh()).ok).toBe(true)
  })

  it('round-trips a skill with gem and support cards', () => {
    const s = fresh()
    const gem = { ...card, name: 'Boneshatter', rarity: 'gem' }
    s.skills = [
      {
        gem: { name: 'Boneshatter', icon: null, level: 2, quality: 20, card: gem },
        supports: [{ name: 'Rapid Attacks III', icon: null, card: { ...gem, name: 'Rapid Attacks III' } }],
      },
    ]
    const result = validateSnapshot(s)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.skills[0].gem.card?.name).toBe('Boneshatter')
      expect(result.snapshot.skills[0].supports[0].card?.name).toBe('Rapid Attacks III')
    }
  })

  it('round-trips a socket card and rejects a card with extra keys', () => {
    const s = fresh()
    s.equipment.Helm.sockets = [{ kind: 'rune', name: card.name, icon: card.icon, card }]
    expect(validateSnapshot(s).ok).toBe(true)
    s.equipment.Helm.sockets[0].card = { ...card, price: null }
    expect(validateSnapshot(s).ok).toBe(false)
  })
})
