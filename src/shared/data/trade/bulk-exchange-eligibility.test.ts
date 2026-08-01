import { describe, expect, it } from 'vitest'
import { isVendorExchangeItem } from './bulk-exchange-eligibility'

describe('isVendorExchangeItem (PoE2 / Ange)', () => {
  it('routes omens to the exchange (clipboard class is singular "Omen")', () => {
    // GGG's RotA filter info lists the class as "Omen", and the clipboard
    // Item Class line is matched verbatim -- a plural "Omens" rule never hits.
    expect(isVendorExchangeItem(2, 'Omen', 'Omen of Chaotic Effectiveness')).toBe(true)
  })

  it('routes stackable currency to the exchange', () => {
    expect(isVendorExchangeItem(2, 'Stackable Currency', 'Divine Orb')).toBe(true)
  })

  it('excludes rare/unique stackables (e.g. beasts)', () => {
    expect(isVendorExchangeItem(2, 'Stackable Currency', 'Some Beast', 'Rare')).toBe(false)
  })

  it('does not route equipment to the exchange', () => {
    expect(isVendorExchangeItem(2, 'Body Armours', 'Ornate Ringmail')).toBe(false)
  })
})

describe('isVendorExchangeItem (PoE1 / Faustus)', () => {
  it('routes stackable currency to the exchange', () => {
    expect(isVendorExchangeItem(1, 'Stackable Currency', 'Chaos Orb', 'Currency')).toBe(true)
  })

  it('excludes Scrying Orbs -- Faustus has no listing for a map-bound orb (#513)', () => {
    expect(isVendorExchangeItem(1, 'Stackable Currency', 'Scrying Orb', 'Currency')).toBe(false)
  })
})
