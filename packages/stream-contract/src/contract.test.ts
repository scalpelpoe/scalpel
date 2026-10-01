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

  it('rejects a filters link off pathofexile.com and a non-web build guide', () => {
    const s = fresh()
    s.links = { filters: 'https://example.com/filters', buildGuide: null }
    expect(validateSnapshot(s).ok).toBe(false)
    s.links = { filters: null, buildGuide: 'javascript:alert(1)' }
    expect(validateSnapshot(s).ok).toBe(false)
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
