/** Faithful port of poe2.re's vendor regex builder (src/pages/vendor/VendorResult.ts).
 *  Mirrors its output bug-for-bug; see vendor-engine.test.ts for the parity check.
 *  Quirks preserved deliberately: all-3 rarities and all-4 resistances drop their
 *  term; movement-speed tiers group by zero/five ending; `[move0, move5].join('')`
 *  relies on Array.toString for the single-tier case. */

import type { VendorSettings } from '@shared/data/regex/vendor-toggles'
export type { VendorSettings } from '@shared/data/regex/vendor-toggles'

export function buildVendorRegex(s: VendorSettings, customText = ''): string {
  const terms = [
    ...itemProperty(s.itemProperty),
    itemType(s.itemType),
    itemLevel(s.itemLevel),
    characterLevel(s.characterLevel),
    resistances(s.resistances),
    movement(s.movementSpeed),
    ...itemMods(s.itemMods),
    customText || null,
    itemClass(s.itemClass),
  ].filter((e) => e !== null && e !== '')
  return terms.length > 0 ? `"${terms.join('|')}"` : ''
}

/** poe2.re generateVendorGroupRegex: one quoted OR-term per non-empty group, AND'd
 *  with a single space. Empty groups contribute nothing; all-empty -> "". customText
 *  is intentionally omitted (Scalpel surfaces custom text only via the Custom tab). */
export function buildVendorGroupsRegex(groups: VendorSettings[]): string {
  return groups
    .map((g) => buildVendorRegex(g))
    .filter((e) => e !== '')
    .join(' ')
}

function itemProperty(s: VendorSettings['itemProperty']): (string | null)[] {
  return [s.quality ? 'y: \\+' : null, s.sockets ? 'ts: S' : null].filter((e) => e !== null)
}

function itemType(s: VendorSettings['itemType']): string | null {
  const types = [s.rare ? 'r' : null, s.magic ? 'm' : null, s.normal ? 'n' : null].filter((e) => e !== null)
  if (types.length === 0 || types.length === 3) return null
  if (types.length > 1) return `y: (${types.join('|')})`
  return `y: ${types.join('|')}`
}

function resistances(s: VendorSettings['resistances']): string | null {
  const res = [s.fire ? 'fi' : null, s.cold ? 'co' : null, s.lightning ? 'li' : null, s.chaos ? 'ch' : null].filter(
    (e) => e !== null,
  )
  if (res.length === 0) return null
  if (res.length === 4) return 'resi'
  if (res.length > 1) return `(${res.join('|')}).+res`
  return `${res.join('|')}.+res`
}

function movement(s: VendorSettings['movementSpeed']): string | null {
  const move0 = [s.move30 ? '30' : null, s.move20 ? '20' : null, s.move10 ? '10' : null].filter((e) => e !== null)
  const move5 = [s.move25 ? '25' : null, s.move15 ? '15' : null].filter((e) => e !== null)
  const numOfSelected = move0.length + move5.length
  if (numOfSelected === 0) return null
  if (numOfSelected === 1) return `${[move0, move5].join('')}% i.+mov`
  if (numOfSelected === 5) return '\\d+% i.+mov'
  const zeros = move0.length > 1 ? `[${move0.map((e) => e[0]).join('')}]0` : move0.join('|')
  const fives = move5.length > 1 ? `[${move5.map((e) => e[0]).join('')}]5` : move5.join('|')
  return `(${[zeros, fives].filter((e) => e !== null && e !== '').join('|')})% i.+mov`
}

function itemMods(s: VendorSettings['itemMods']): (string | null)[] {
  const eleDamage = s.elemental
    ? '[cfl]'
    : [
        s.coldDamage ? 'co' : null,
        s.chaosDamage ? 'ch' : null,
        s.fireDamage ? 'f' : null,
        s.lightningDamage ? 'l' : null,
      ]
        .filter((e) => e !== null)
        .join('|')
  const eleString = eleDamage.includes('|') ? `(${eleDamage})` : `${eleDamage}`
  const attributes = [s.strength ? 'str' : null, s.dexterity ? 'd' : null, s.intelligence ? 'int' : null]
    .filter((e) => e !== null)
    .join('|')

  return [
    s.physical ? 'ph.*da' : null,
    s.spellDamage ? 'ell.*ge$' : null,
    eleDamage ? `\\d ${eleString}.+da` : null,
    s.skillLevel ? '^\\+.*ills$' : null,
    s.skillLevelMinion ? '^\\+.*ion skills$' : null,
    s.skillLevelMelee ? '^\\+.*ee skills$' : null,
    s.skillLevelSpell ? '^\\+.*l sp.*ls$' : null,
    s.skillLevelFire ? '^\\+.*re sp.*ls$' : null,
    s.skillLevelCold ? '^\\+.*ld sp.*ls$' : null,
    s.skillLevelLightning ? '^\\+.*ng sp.*ls$' : null,
    s.skillLevelPhysical ? '^\\+.*al sp.*ls$' : null,
    s.skillLevelProjectile ? '^\\+.*ile skills$' : null,
    s.spirit ? 'spiri' : null,
    s.rarity ? 'd rari' : null,
    s.attackSpeed ? 'ck spe' : null,
    s.castSpeed ? 'st spe' : null,
    s.maxLife ? '\\d.+m life' : null,
    s.maxMana ? '\\d.+mana' : null,
    attributes ? `o (all a|${attributes})` : null,
  ].filter((e) => e !== null)
}

function itemClass(s: VendorSettings['itemClass']): string | null {
  const itemClasses = [
    s.amulets ? 'am' : null,
    s.rings ? 'ri' : null,
    s.belts ? 'be' : null,
    s.daggers ? 'da' : null,
    s.wands ? 'wa' : null,
    s.oneHandMaces ? 'on' : null,
    s.sceptres ? 'sc' : null,
    s.bows ? 'bow' : null,
    s.staves ? 'st' : null,
    s.twoHandMaces ? 'tw' : null,
    s.quarterstaves ? 'qua' : null,
    s.spears ? 'spe' : null,
    s.crossbows ? 'cr' : null,
    s.talisman ? 'tali' : null,
    s.gloves ? 'gl' : null,
    s.boots ? 'boo' : null,
    s.bodyArmours ? 'bod' : null,
    s.helmets ? 'he' : null,
    s.quivers ? 'qui' : null,
    s.foci ? 'fo' : null,
    s.shields ? 'sh' : null,
  ].filter((e) => e !== null)
  if (itemClasses.length === 0) return null
  if (itemClasses.length === 1) return `s: ${itemClasses.join('')}`
  return `s: (${itemClasses.join('|')})`
}

function itemLevel(s: VendorSettings['itemLevel']): string | null {
  return createLevelRangeRegex(s.min, s.max, 'm level: ')
}

function characterLevel(s: VendorSettings['characterLevel']): string | null {
  return createLevelRangeRegex(s.min, s.max, 's: level ')
}

function createLevelRangeRegex(min: number, max: number, prefix: string): string | null {
  if (min === 0 && max === 0) return null
  if (max > 0 && min > max) return null
  const effectiveMax = max === 0 ? 99 : max
  if (min === 0 && effectiveMax === 99) return `${prefix}(\\d{1,2})\\b`
  if (min > 0 && min === effectiveMax) return `${prefix}(${min})\\b`
  const singleDigits = min <= 9 ? rangePattern(min, Math.min(9, effectiveMax)) : ''
  const tens = Math.floor(Math.min(Math.max(min, 10), effectiveMax) / 10)
  const maxTens = Math.floor(effectiveMax / 10)
  const patterns: string[] = []
  if (singleDigits) patterns.push(singleDigits)
  if (tens <= maxTens) {
    if (tens === maxTens) {
      const minOnes = min > 9 ? min % 10 : 0
      const maxOnes = effectiveMax % 10
      patterns.push(`${tens}[${minOnes}-${maxOnes}]`)
    } else {
      if (min <= tens * 10 + 9 && min > tens * 10) {
        patterns.push(`${tens}[${min % 10}-9]`)
      } else if (min <= tens * 10) {
        patterns.push(`${tens}\\d`)
      }
      if (maxTens > tens + 1) {
        patterns.push(`[${tens + 1}-${maxTens - 1}]\\d`)
      }
      if (effectiveMax % 10 > 0) {
        patterns.push(`${maxTens}[0-${effectiveMax % 10}]`)
      } else {
        patterns.push(`${maxTens}0`)
      }
    }
  }
  return `${prefix}(${patterns.join('|')})\\b`
}

function rangePattern(start: number, end: number): string {
  if (start > end) return ''
  if (start === end) return start.toString()
  if (start === 0 && end === 9) return '\\d'
  return `[${start}-${end}]`
}
