// Builds fixtures/sample-snapshot.json: a hand-authored PoE2 character whose item
// art comes from @scalpel/item-data, so viewer stories render real poecdn icons.
// Run: npm run build-sample --prefix packages/stream-contract
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const icons = JSON.parse(readFileSync(resolve(here, '../../item-data/poe2.json'), 'utf8'))

function icon(name) {
  const url = icons[name]
  if (!url) throw new Error(`no poe2 icon for "${name}" in @scalpel/item-data`)
  return url
}

const tier = (affix, num) => ({ affix, num, label: `${affix === 'prefix' ? 'P' : 'S'}${num}` })
const line = (text, extra = {}) => ({ text, ...extra })
const tiered = (text, affix, num, min, max, extra = {}) => ({ text, tier: tier(affix, num), range: { min, max }, ...extra })

function item(fields) {
  return {
    name: null,
    ilvl: null,
    flags: {},
    properties: [],
    requirements: [],
    sections: [],
    sockets: [],
    price: null,
    w: 1,
    h: 1,
    ...fields,
  }
}

const snapshot = {
  schema: 1,
  game: 'poe2',
  character: { name: 'SampleExile', class: 'Deadeye', level: 92, league: 'Standard', activeWeaponSet: 2 },
  source: { kind: 'sample', updatedUtc: '2026-09-29T11:52:48Z' },
  publishedUtc: '2026-09-29T12:10:05Z',
  equipment: {
    Weapon: item({
      name: 'Doom Knell',
      baseType: 'Flanged Mace',
      rarity: 'rare',
      icon: icon('Flanged Mace'),
      w: 2,
      h: 3,
      ilvl: 81,
      properties: [
        { name: 'Physical Damage', value: '58-120' },
        { name: 'Critical Hit Chance', value: '5.00%' },
        { name: 'Attacks per Second', value: '1.45' },
      ],
      requirements: [
        { name: 'Level', value: '67' },
        { name: 'Str', value: '125' },
      ],
      sections: [
        {
          kind: 'explicit',
          lines: [
            tiered('165% increased Physical Damage', 'prefix', 1, 155, 169),
            tiered('Adds 18 to 34 Physical Damage', 'prefix', 2, 16, 36),
            tiered('+4.2% to Critical Hit Chance', 'suffix', 1, 4.1, 5),
            tiered('12% increased Attack Speed', 'suffix', 2, 11, 13),
          ],
        },
      ],
    }),
    Weapon2: item({
      name: 'Rage Song',
      baseType: 'Obliterator Bow',
      rarity: 'rare',
      icon: icon('Obliterator Bow'),
      w: 2,
      h: 4,
      ilvl: 83,
      properties: [
        { name: 'Quality', value: '+20%' },
        { name: 'Physical Damage', value: '110-203' },
        { name: 'Critical Hit Chance', value: '5.00%' },
        { name: 'Attacks per Second', value: '1.20' },
      ],
      requirements: [
        { name: 'Level', value: '78' },
        { name: 'Dex', value: '163' },
      ],
      sections: [
        { kind: 'rune', lines: [line('Adds 7 to 12 Fire Damage')] },
        {
          kind: 'explicit',
          lines: [
            tiered('172% increased Physical Damage', 'prefix', 1, 170, 179),
            tiered('Adds 21 to 38 Physical Damage', 'prefix', 1, 20, 40),
            tiered('+5 to Level of all Projectile Skills', 'prefix', 1, 5, 5),
            tiered('+3.8% to Critical Hit Chance', 'suffix', 2, 3.1, 3.8),
            tiered('+35% to Critical Damage Bonus', 'suffix', 1, 34, 39),
          ],
        },
      ],
      sockets: [{ kind: 'rune', name: 'Soul Core of Tacati', icon: icon('Soul Core of Tacati') }],
    }),
    Offhand2: item({
      name: 'Dragon Nock',
      baseType: 'Visceral Quiver',
      rarity: 'rare',
      icon: icon('Visceral Quiver'),
      w: 2,
      h: 3,
      ilvl: 82,
      requirements: [{ name: 'Level', value: '65' }],
      sections: [
        { kind: 'implicit', lines: [line('25% increased Critical Hit Chance for Attacks')] },
        {
          kind: 'explicit',
          lines: [
            tiered('+2 to Level of all Projectile Skills', 'prefix', 1, 2, 2),
            tiered('+95 to maximum Life', 'prefix', 1, 90, 104),
            tiered('30% increased Projectile Speed', 'suffix', 2, 26, 32),
            tiered('+38% to Fire Resistance', 'suffix', 1, 36, 40),
          ],
        },
      ],
    }),
    Helm: item({
      name: 'Grim Veil',
      baseType: 'Ancestral Tiara',
      rarity: 'rare',
      icon: icon('Ancestral Tiara'),
      w: 2,
      h: 2,
      ilvl: 82,
      properties: [
        { name: 'Quality', value: '+20%' },
        { name: 'Energy Shield', value: '312' },
      ],
      requirements: [
        { name: 'Level', value: '75' },
        { name: 'Int', value: '142' },
      ],
      sections: [
        { kind: 'rune', lines: [line('+12% to Cold Resistance')] },
        {
          kind: 'explicit',
          lines: [
            tiered('+62 to maximum Energy Shield', 'prefix', 1, 57, 66),
            tiered('84% increased Energy Shield', 'prefix', 2, 80, 91),
            tiered('+112 to maximum Life', 'prefix', 1, 100, 119),
            tiered('+38% to Fire Resistance', 'suffix', 2, 36, 40),
            tiered('+41% to Lightning Resistance', 'suffix', 1, 41, 45),
            tiered('+22% to Chaos Resistance', 'suffix', 3, 20, 23),
          ],
        },
      ],
      sockets: [{ kind: 'rune', name: 'Greater Rune of Leadership', icon: icon('Greater Rune of Leadership') }],
    }),
    BodyArmour: item({
      name: 'Morior Invictus',
      baseType: 'Grand Regalia',
      rarity: 'unique',
      icon: icon('Morior Invictus'),
      w: 2,
      h: 3,
      ilvl: 84,
      properties: [
        { name: 'Quality', value: '+20%' },
        { name: 'Energy Shield', value: '705' },
      ],
      requirements: [
        { name: 'Level', value: '78' },
        { name: 'Int', value: '172' },
      ],
      sections: [
        {
          kind: 'explicit',
          lines: [
            line('+150 to maximum Energy Shield'),
            line('+16% to all Elemental Resistances'),
            line('Gain 20% of Maximum Life as Extra Maximum Energy Shield'),
            line('Recover 2% of maximum Energy Shield when you Kill an Enemy'),
          ],
        },
      ],
      price: { amount: 3.5, currency: 'divine' },
    }),
    Gloves: item({
      name: 'Blight Grip',
      baseType: 'Elegant Wraps',
      rarity: 'rare',
      icon: icon('Elegant Wraps'),
      w: 2,
      h: 2,
      ilvl: 80,
      properties: [{ name: 'Evasion Rating', value: '221' }],
      requirements: [
        { name: 'Level', value: '65' },
        { name: 'Dex', value: '96' },
      ],
      sections: [
        {
          kind: 'explicit',
          lines: [
            tiered('Adds 12 to 21 Physical Damage to Attacks', 'prefix', 1, 11, 22),
            tiered('+85 to maximum Life', 'prefix', 2, 80, 89),
            tiered('16% increased Attack Speed', 'suffix', 1, 14, 16),
            tiered('+34% to Cold Resistance', 'suffix', 2, 31, 35),
          ],
        },
      ],
    }),
    Boots: item({
      name: 'Birth of Fury',
      baseType: 'Stone Greaves',
      rarity: 'unique',
      icon: icon('Birth of Fury'),
      w: 2,
      h: 2,
      ilvl: 79,
      properties: [{ name: 'Armour', value: '268' }],
      requirements: [
        { name: 'Level', value: '70' },
        { name: 'Str', value: '120' },
      ],
      sections: [
        {
          kind: 'explicit',
          lines: [
            line('30% increased Movement Speed'),
            line('+90 to maximum Life'),
            line('Gain 1 Rage on Melee Hit'),
            line('+25% to Fire Resistance'),
          ],
        },
      ],
      price: { amount: 40, currency: 'exalted' },
    }),
    Amulet: item({
      name: 'Vortex Clasp',
      baseType: 'Solar Amulet',
      rarity: 'rare',
      icon: icon('Solar Amulet'),
      ilvl: 82,
      flags: { fractured: true, desecrated: true },
      requirements: [{ name: 'Level', value: '74' }],
      sections: [
        { kind: 'enchant', lines: [line('Allocates Heavy Buffer')] },
        { kind: 'implicit', lines: [line('+10 to Spirit')] },
        {
          kind: 'explicit',
          lines: [
            tiered('+3 to Level of all Projectile Skills', 'prefix', 1, 3, 3, { fractured: true }),
            tiered('+54 to Spirit', 'prefix', 1, 50, 55),
            tiered('+38% to Critical Damage Bonus', 'suffix', 1, 35, 39),
            tiered('+43 to Dexterity', 'suffix', 2, 41, 45),
            tiered('+31% to Lightning Resistance', 'suffix', 3, 31, 35),
          ],
        },
        { kind: 'desecrated', lines: [line('12% increased Skill Speed')] },
      ],
    }),
    Ring: item({
      name: 'Plague Loop',
      baseType: 'Topaz Ring',
      rarity: 'rare',
      icon: icon('Topaz Ring'),
      ilvl: 81,
      requirements: [{ name: 'Level', value: '60' }],
      sections: [
        { kind: 'implicit', lines: [line('+12% to Lightning Resistance')] },
        {
          kind: 'explicit',
          lines: [
            tiered('Adds 4 to 68 Lightning damage to Attacks', 'prefix', 1, 3, 70),
            tiered('+95 to Accuracy Rating', 'prefix', 3, 85, 123),
            tiered('+27 to Dexterity', 'suffix', 2, 25, 28),
            tiered('+22% to Cold Resistance', 'suffix', 3, 21, 25),
          ],
        },
      ],
    }),
    Ring2: item({
      name: 'Blood Band',
      baseType: 'Gold Ring',
      rarity: 'rare',
      icon: icon('Gold Ring'),
      ilvl: 83,
      requirements: [{ name: 'Level', value: '62' }],
      sections: [
        { kind: 'implicit', lines: [line('11% increased Rarity of Items found')] },
        {
          kind: 'explicit',
          lines: [
            tiered('+72 to maximum Life', 'prefix', 1, 70, 84),
            tiered('Adds 5 to 9 Physical Damage to Attacks', 'prefix', 2, 4, 10),
            tiered('+36% to Fire Resistance', 'suffix', 2, 31, 35),
            tiered('+15% to Chaos Resistance', 'suffix', 3, 14, 17),
          ],
        },
      ],
    }),
    Belt: item({
      name: 'Tempest Cord',
      baseType: 'Utility Belt',
      rarity: 'rare',
      icon: icon('Utility Belt'),
      w: 2,
      ilvl: 80,
      requirements: [{ name: 'Level', value: '55' }],
      sections: [
        { kind: 'implicit', lines: [line('20% of Flask Recovery applied Instantly')] },
        {
          kind: 'explicit',
          lines: [
            tiered('+118 to maximum Life', 'prefix', 1, 110, 124),
            tiered('+44 to Strength', 'suffix', 1, 41, 45),
            tiered('+27% to Cold Resistance', 'suffix', 2, 26, 30),
            tiered('18% increased Charm Effect Duration', 'suffix', 3, 16, 20),
          ],
        },
      ],
    }),
  },
  flasks: [
    item({
      name: 'Concentrated Ultimate Life Flask of the Surgeon',
      baseType: 'Ultimate Life Flask',
      rarity: 'magic',
      icon: icon('Ultimate Life Flask'),
      h: 2,
      ilvl: 83,
      properties: [
        { name: 'Recovers 1330 Life over 3 Seconds', value: null },
        { name: 'Consumes 10 of 75 Charges on use', value: null },
      ],
      sections: [
        {
          kind: 'explicit',
          lines: [
            line('40% increased Amount Recovered'),
            line('25% chance to gain a Flask Charge when you deal a Critical Hit'),
          ],
        },
      ],
    }),
    item({
      name: 'Saturated Lesser Mana Flask of the Chemist',
      baseType: 'Lesser Mana Flask',
      rarity: 'magic',
      icon: icon('Lesser Mana Flask'),
      h: 2,
      ilvl: 60,
      properties: [{ name: 'Recovers 120 Mana over 3 Seconds', value: null }],
      sections: [{ kind: 'explicit', lines: [line('30% reduced Charges per use')] }],
    }),
  ],
  charms: [
    item({
      name: 'Thawing Charm of the Ox',
      baseType: 'Thawing Charm',
      rarity: 'magic',
      icon: icon('Thawing Charm'),
      ilvl: 78,
      properties: [{ name: 'Used when you become Frozen', value: null }],
      sections: [{ kind: 'explicit', lines: [line('+14 to Strength')] }],
    }),
  ],
  jewels: [
    item({
      name: 'Storm Heart',
      baseType: 'Sapphire',
      rarity: 'rare',
      icon: icon('Sapphire'),
      ilvl: 80,
      sections: [
        {
          kind: 'explicit',
          lines: [
            line('15% increased Lightning Damage'),
            line('8% increased Projectile Speed'),
            line('+6% to Critical Damage Bonus'),
          ],
        },
      ],
    }),
    item({
      name: 'Viper Eye',
      baseType: 'Emerald',
      rarity: 'rare',
      icon: icon('Emerald'),
      ilvl: 79,
      sections: [
        {
          kind: 'explicit',
          lines: [line('6% increased Attack Speed with Bows'), line('10% increased Evasion Rating')],
        },
      ],
    }),
  ],
  other: [],
  skills: [
    {
      gem: { name: 'Lightning Arrow', icon: null, level: 20, quality: 20 },
      supports: [
        { name: 'Pierce', icon: null },
        { name: 'Lightning Penetration', icon: null },
        { name: 'Magnified Area', icon: null },
      ],
    },
    { gem: { name: 'Herald of Thunder', icon: null, level: 18, quality: 0 }, supports: [{ name: 'Overabundance', icon: null }] },
    { gem: { name: 'Wind Dancer', icon: null, level: 20, quality: 0 }, supports: [] },
    { gem: { name: 'Escape Shot', icon: null, level: 19, quality: 0 }, supports: [{ name: 'Cold Penetration', icon: null }] },
  ],
  keystones: [
    {
      name: 'Resonance',
      icon: 'https://assets.poe.ninja/poe2/tree/passives/resonancekeystone.webp',
      stats: [
        'Gain Power Charges instead of Frenzy Charges',
        'Gain Frenzy Charges instead of Endurance Charges',
        'Gain Endurance Charges instead of Power Charges',
      ],
    },
    {
      name: "Giant's Blood",
      icon: null,
      stats: ['You can wield Two-Handed Axes, Maces and Swords in one hand', 'Triple Attribute requirements of Martial Weapons'],
    },
  ],
  pob: null,
  patches: [{ slot: 'Ring2', atUtc: '2026-09-29T12:10:00Z' }],
}

const out = resolve(here, '../fixtures/sample-snapshot.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(`wrote ${out}`)
