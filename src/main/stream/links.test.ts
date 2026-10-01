import { DEFAULT_STREAM_SETTINGS } from '@shared/contracts/stream'
import { describe, expect, it } from 'vitest'
import { normalizeBuildGuideUrl, snapshotLinks } from './links'

describe('normalizeBuildGuideUrl', () => {
  it('keeps full web links and clears blanks', () => {
    expect(normalizeBuildGuideUrl('  https://www.youtube.com/watch?v=abc  ')).toBe(
      'https://www.youtube.com/watch?v=abc',
    )
    expect(normalizeBuildGuideUrl('http://example.com/guide')).toBe('http://example.com/guide')
    expect(normalizeBuildGuideUrl('   ')).toBe('')
  })

  it('adds https to a bare address', () => {
    expect(normalizeBuildGuideUrl('youtu.be/abc')).toBe('https://youtu.be/abc')
  })

  it('refuses anything that is not a web address', () => {
    expect(() => normalizeBuildGuideUrl('javascript:alert(1)')).toThrow(/isn't a web address/)
    expect(() => normalizeBuildGuideUrl('my build')).toThrow(/isn't a web address/)
    expect(() => normalizeBuildGuideUrl('ftp://example.com/x')).toThrow(/isn't a web address/)
  })
})

describe('snapshotLinks', () => {
  const prefs = { ...DEFAULT_STREAM_SETTINGS, poeAccount: 'aer0_#2690' }

  it('links the account filters page by default', () => {
    expect(snapshotLinks(prefs).filters).toBe(
      'https://www.pathofexile.com/account/view-profile/aer0_-2690/item-filters',
    )
  })

  it('has no filters link without an account or when turned off', () => {
    expect(snapshotLinks({ ...prefs, poeAccount: '' }).filters).toBeNull()
    expect(snapshotLinks({ ...prefs, poeAccount: 'no-discriminator' }).filters).toBeNull()
    expect(snapshotLinks({ ...prefs, linkItemFilters: false }).filters).toBeNull()
  })

  it('passes the build guide through and nulls an empty one', () => {
    expect(snapshotLinks(prefs).buildGuide).toBeNull()
    expect(snapshotLinks({ ...prefs, buildGuideUrl: 'https://youtu.be/abc' }).buildGuide).toBe('https://youtu.be/abc')
  })
})
