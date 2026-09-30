import { describe, expect, it } from 'vitest'
import { ninjaAccountKey, normalizePoeAccount } from './poe-account'

describe('normalizePoeAccount', () => {
  it.each([
    ['TheLinkin#0627', 'TheLinkin#0627'],
    ['  TheLinkin-0627 ', 'TheLinkin#0627'],
    ['aer0_-2690', 'aer0_#2690'],
    ['https://poe.ninja/poe2/profile/TheLinkin-0627', 'TheLinkin#0627'],
    ['poe.ninja/poe2/profile/aer0_-2690/forbiddenrites/character/GassiusClay', 'aer0_#2690'],
    // The last dash-and-four-digits is the discriminator.
    ['foo-bar-1234', 'foo-bar#1234'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePoeAccount(input)).toBe(expected)
  })

  it('returns text without a discriminator trimmed, for the publisher to reject', () => {
    expect(normalizePoeAccount(' TheLinkin ')).toBe('TheLinkin')
    expect(normalizePoeAccount('')).toBe('')
  })
})

describe('ninjaAccountKey', () => {
  it("spells the account the way poe.ninja's URLs do", () => {
    expect(ninjaAccountKey('aer0_#2690')).toBe('aer0_-2690')
    expect(ninjaAccountKey('aer0_-2690')).toBe('aer0_-2690')
    expect(ninjaAccountKey('foo-bar#1234')).toBe('foo-bar-1234')
  })

  it('refuses accounts without a #1234', () => {
    expect(ninjaAccountKey('TheLinkin')).toBeNull()
    expect(ninjaAccountKey('The Linkin#0627')).toBeNull()
    expect(ninjaAccountKey('TheLinkin#627')).toBeNull()
  })
})
