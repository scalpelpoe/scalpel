import { describe, expect, it } from 'vitest'
import { selectListRelease } from './select-release'

type Rel = { tag_name: string; assets: Array<{ name: string }> }

const withManifest = (tag: string): Rel => ({
  tag_name: tag,
  assets: [{ name: 'manifest.json' }, { name: 'app.asar' }],
})
const noManifest = (tag: string): Rel => ({ tag_name: tag, assets: [{ name: 'app.asar' }] })

describe('selectListRelease', () => {
  it('experimental picks the newest installable release, including -exp tags', () => {
    const releases = [withManifest('v0.9.14-exp.1'), withManifest('v0.9.13-rc3'), withManifest('v0.9.12')]
    expect(selectListRelease('experimental', releases)?.tag_name).toBe('v0.9.14-exp.1')
  })

  it('beta skips -exp tags and picks the newest non-exp installable release', () => {
    const releases = [withManifest('v0.9.14-exp.1'), withManifest('v0.9.13-rc3'), withManifest('v0.9.12')]
    expect(selectListRelease('beta', releases)?.tag_name).toBe('v0.9.13-rc3')
  })

  it('experimental falls through to a newer non-exp build when it is newest', () => {
    const releases = [withManifest('v0.9.15-rc1'), withManifest('v0.9.14-exp.1')]
    expect(selectListRelease('experimental', releases)?.tag_name).toBe('v0.9.15-rc1')
  })

  it('both channels skip releases without a manifest.json asset', () => {
    const releases = [noManifest('v0.9.14-exp.1'), noManifest('v0.9.13-rc3'), withManifest('v0.9.12')]
    expect(selectListRelease('experimental', releases)?.tag_name).toBe('v0.9.12')
    expect(selectListRelease('beta', releases)?.tag_name).toBe('v0.9.12')
  })

  it('the -exp match is case-insensitive and matches -experimental', () => {
    const releases = [withManifest('v0.9.14-EXPERIMENTAL'), withManifest('v0.9.13')]
    expect(selectListRelease('beta', releases)?.tag_name).toBe('v0.9.13')
    expect(selectListRelease('experimental', releases)?.tag_name).toBe('v0.9.14-EXPERIMENTAL')
  })

  it('returns undefined when nothing is installable', () => {
    expect(selectListRelease('beta', [noManifest('v0.9.14-exp.1')])).toBeUndefined()
  })
})
