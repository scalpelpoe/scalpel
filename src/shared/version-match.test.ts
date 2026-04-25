import { describe, it, expect } from 'vitest'
import { compareVersions, versionMatches, findBrickedMatch } from './version-match'

describe('compareVersions', () => {
  it('handles numeric segments correctly (10 > 9)', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.9.9', '0.10.0')).toBeLessThan(0)
  })

  it('treats release > any pre-release of same version', () => {
    expect(compareVersions('0.9.5', '0.9.5-rc1')).toBeGreaterThan(0)
    expect(compareVersions('0.9.5-rc7', '0.9.5')).toBeLessThan(0)
  })

  it('compares pre-release labels lexically', () => {
    expect(compareVersions('0.9.5-rc2', '0.9.5-rc1')).toBeGreaterThan(0)
    expect(compareVersions('0.9.5-rc1', '0.9.5-rc7')).toBeLessThan(0)
  })

  it('returns zero for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })
})

describe('versionMatches', () => {
  it('treats bare entry as exact match', () => {
    expect(versionMatches('0.10.1', '0.10.1')).toBe(true)
    expect(versionMatches('0.10.1', '0.10.2')).toBe(false)
  })

  it('handles < prefix', () => {
    expect(versionMatches('<0.9.5', '0.9.4')).toBe(true)
    expect(versionMatches('<0.9.5', '0.9.5')).toBe(false)
    expect(versionMatches('<0.10.0', '0.9.99')).toBe(true)
  })

  it('handles <= and >= prefixes', () => {
    expect(versionMatches('<=0.9.5', '0.9.5')).toBe(true)
    expect(versionMatches('<=0.9.5', '0.9.6')).toBe(false)
    expect(versionMatches('>=0.9.5', '0.9.5')).toBe(true)
    expect(versionMatches('>=0.9.5', '0.9.4')).toBe(false)
  })

  it('respects pre-release ordering with comparators', () => {
    expect(versionMatches('<0.9.5', '0.9.5-rc7')).toBe(true)
    expect(versionMatches('<=0.9.5-rc3', '0.9.5-rc2')).toBe(true)
    expect(versionMatches('<=0.9.5-rc3', '0.9.5-rc4')).toBe(false)
  })
})

describe('findBrickedMatch', () => {
  it('returns the first matching entry', () => {
    expect(findBrickedMatch(['<0.9.5', '0.10.1'], '0.9.3')).toBe('<0.9.5')
    expect(findBrickedMatch(['<0.9.5', '0.10.1'], '0.10.1')).toBe('0.10.1')
    expect(findBrickedMatch(['<0.9.5', '0.10.1'], '0.9.5')).toBeNull()
  })

  it('handles undefined entries', () => {
    expect(findBrickedMatch(undefined, '0.9.5')).toBeNull()
  })
})
