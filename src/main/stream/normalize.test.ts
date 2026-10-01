import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LIMITS, validateSnapshot } from '@scalpel/stream-contract'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter, normalizeItem } from './normalize'
import { NinjaCharacterSchema } from './sources/ninja-types'

const character = NinjaCharacterSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '__fixtures__/ninja-character.json'), 'utf8')),
)
const now = new Date('2026-09-29T12:00:00Z')
const normalize = (hideCharacterName = false) => normalizeCharacter(character, { now, hideCharacterName })

describe('normalizeCharacter', () => {
  it('produces a snapshot that passes the contract gate', () => {
    const { snapshot, warnings } = normalize()
    const result = validateSnapshot(snapshot)
    if (!result.ok) throw new Error(result.issues.join('\n'))
    expect(warnings).toEqual([])
  })

  it('maps equipment by inventory slot', () => {
    const { snapshot } = normalize()
    expect(Object.keys(snapshot.equipment).sort()).toEqual(
      [
        'Amulet',
        'Belt',
        'BodyArmour',
        'Boots',
        'Gloves',
        'Helm',
        'Offhand2',
        'Ring',
        'Ring2',
        'Weapon',
        'Weapon2',
      ].sort(),
    )
    expect(snapshot.other).toEqual([])
  })

  it('splits the flask belt into flasks and charms by position', () => {
    const { snapshot } = normalize()
    expect(snapshot.flasks.map((f) => f.baseType)).toEqual(['Ultimate Life Flask', 'Gargantuan Mana Flask'])
    expect(snapshot.charms.map((c) => c.baseType)).toEqual(['Golden Charm', 'Thawing Charm', 'Silver Charm'])
    expect(snapshot.flasks[1].rarity).toBe('unique')
  })

  it('keeps jewels, skills with supports, keystones and the PoB code', () => {
    const { snapshot } = normalize()
    expect(snapshot.jewels).toHaveLength(7)
    const boneshatter = snapshot.skills.find((s) => s.gem.name === 'Boneshatter')
    expect(boneshatter?.supports.map((s) => s.name)).toContain('Rapid Attacks III')
    expect(boneshatter?.gem.icon).toMatch(/^https:\/\/web\.poecdn\.com\//)
    expect(snapshot.keystones).toEqual([
      {
        name: 'Dance with Death',
        icon: 'https://assets.poe.ninja/poe2/tree/passives/dancewithdeathkeystone.webp',
        stats: [
          '25% more Skill Speed while Off Hand is empty and you have\na One-Handed Martial Weapon equipped in your Main Hand',
        ],
      },
    ])
    expect(snapshot.pob).toMatch(/^eN/)
  })

  it('only builds keystone art from plain relative paths', () => {
    for (const icon of ['https://evil.example/x.webp', '../../x.webp', 'passives/x.svg', '']) {
      const raw = { ...character, keystones: [{ name: 'Resonance', icon, stats: [] }] }
      const { snapshot } = normalizeCharacter(raw, { now, hideCharacterName: false })
      expect(snapshot.keystones[0].icon).toBeNull()
    }
  })

  it('names rares, lists sections in tooltip order, and strips GGG markup', () => {
    const { snapshot } = normalize()
    const ring = snapshot.equipment.Ring2
    expect(ring).toMatchObject({ name: 'Blood Knot', baseType: 'Gold Ring', rarity: 'rare' })
    expect(ring?.flags).toMatchObject({ corrupted: true, desecrated: true })
    expect(ring?.sections.map((s) => s.kind)).toEqual(['implicit', 'desecrated'])
    expect(ring?.sections[0].lines[0].text).toBe('10% increased Rarity of Items found')
    const allText = Object.values(snapshot.equipment).flatMap(
      (i) => i?.sections.flatMap((s) => s.lines.map((l) => l.text)) ?? [],
    )
    expect(allText.some((t) => t.includes('[') || t.includes('|'))).toBe(false)
  })

  it('carries rune sockets and their effects', () => {
    const { snapshot } = normalize()
    const gloves = snapshot.equipment.Gloves
    expect(gloves?.sockets[0]).toMatchObject({ kind: 'rune', name: "Kolr's Hunt" })
    const runes = gloves?.sections.find((s) => s.kind === 'rune')
    expect(runes?.lines.map((l) => l.text)).toContain('Bonded: 20% increased Projectile Damage')
  })

  it('formats requirements and properties as display strings', () => {
    const { snapshot } = normalize()
    expect(snapshot.equipment.Ring2?.requirements).toEqual([{ name: 'Level', value: '56' }])
    expect(snapshot.equipment.Ring2?.properties).toEqual([{ name: 'Ring', value: null }])
  })

  it('normalizes timestamps and the weapon set', () => {
    const { snapshot } = normalize()
    expect(snapshot.source).toEqual({ kind: 'poe.ninja', updatedUtc: '2026-09-28T22:03:09.981Z' })
    expect(snapshot.publishedUtc).toBe('2026-09-29T12:00:00.000Z')
    expect(snapshot.character.activeWeaponSet).toBe(1)
  })

  it('hides the character name on request', () => {
    expect(normalize(true).snapshot.character.name).toBeNull()
    expect(normalize(false).snapshot.character.name).toBe('SampleExile')
  })
})

describe('normalizeItem', () => {
  it('drops items without poecdn art and says why', () => {
    const warnings: string[] = []
    const result = normalizeItem({ typeLine: 'Gold Ring', icon: 'https://example.com/x.png' }, warnings, 'equipment')
    expect(result).toBeNull()
    expect(warnings).toEqual(['equipment: Gold Ring has no item art'])
  })

  it('fills displayMode 3 property templates', () => {
    const result = normalizeItem(
      {
        typeLine: 'Ultimate Life Flask',
        icon: 'https://web.poecdn.com/x.png',
        properties: [
          {
            name: 'Recovers {0} Life over {1} Seconds',
            values: [
              ['1330', 0],
              ['3', 0],
            ],
            displayMode: 3,
          },
        ],
      },
      [],
      'flasks',
    )
    expect(result?.item.properties).toEqual([{ name: 'Recovers 1330 Life over 3 Seconds', value: null }])
  })

  it('uses the full magic name and leaves normal items unnamed', () => {
    const magic = normalizeItem(
      {
        typeLine: 'Dense Ultimate Life Flask',
        baseType: 'Ultimate Life Flask',
        frameType: 1,
        icon: 'https://web.poecdn.com/a.png',
      },
      [],
      'flasks',
    )
    const normal = normalizeItem(
      { typeLine: 'Gold Ring', baseType: 'Gold Ring', frameType: 0, icon: 'https://web.poecdn.com/b.png' },
      [],
      'equipment',
    )
    expect(magic?.item.name).toBe('Dense Ultimate Life Flask')
    expect(normal?.item.name).toBeNull()
  })
})

describe('gem and rune cards', () => {
  it('builds the main gem card from its item data', () => {
    const { snapshot } = normalize()
    const gem = snapshot.skills.find((s) => s.gem.name === 'Boneshatter')?.gem.card
    expect(gem?.name).toBe('Boneshatter')
    expect(gem?.rarity).toBe('gem')
    expect(gem?.properties[0]).toEqual({ name: 'Attack, AoE, Melee, Strike', value: null })
    expect(gem?.properties).toContainEqual({ name: 'Level', value: '2' })
    expect(gem?.properties).toContainEqual({ name: 'Quality', value: '+20%' })
    expect(gem?.requirements).toContainEqual({ name: 'Level', value: '3' })
    expect(gem?.sections[0].kind).toBe('description')
    expect(gem?.sections[0].lines[0].text).toMatch(/^Attack enemies with a melee Strike\./)
  })

  it('builds support cards, with gem stats when the support lists them', () => {
    const { snapshot } = normalize()
    const support = snapshot.skills.flatMap((s) => s.supports).find((s) => s.name === 'Rapid Attacks III')
    expect(support?.card?.rarity).toBe('gem')
    expect(support?.card?.sections[0].lines[0].text).toMatch(/^Supports Attacks/)
    expect(support?.card?.sections[1].lines.map((l) => l.text)).toContain('Supported Skills deal 50% less Damage')
  })

  it('attaches rune cards to their sockets', () => {
    const { snapshot } = normalize()
    const card = snapshot.equipment.Gloves?.sockets.find((s) => s.name === "Kolr's Hunt")?.card
    expect(card?.rarity).toBe('currency')
    expect(card?.properties).toEqual([{ name: 'Limited to', value: '1' }])
    expect(card?.sections[0].lines.map((l) => l.text)).toEqual(['Gloves: Can roll Marksman modifiers'])
    const texts = card?.sections.flatMap((s) => s.lines.map((l) => l.text)) ?? []
    expect(texts.some((t) => t.startsWith('Place into an empty Augment Socket'))).toBe(true)
    expect(texts.some((t) => t.startsWith('To win over the Wildking'))).toBe(true)
    expect(JSON.stringify(card)).not.toContain('\r')
  })

  it('validates the whole snapshot and stays under the size cap', () => {
    const { snapshot } = normalize()
    expect(validateSnapshot(snapshot).ok).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(LIMITS.snapshotBytes)
  })
})
