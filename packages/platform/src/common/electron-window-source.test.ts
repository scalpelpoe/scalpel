import { describe, it, expect } from 'vitest'
import { matchBestGameWindowSource, matchGameWindowSource } from './electron-window-source'

describe('matchGameWindowSource', () => {
  it('prefers an exact title match', () => {
    const sources = [
      { id: 'window:1', name: 'Discord' },
      { id: 'window:2', name: 'Path of Exile' },
    ]
    expect(matchGameWindowSource(sources, 'Path of Exile')).toBe('window:2')
  })

  it('does not match PoE1 title against a PoE2 window', () => {
    const sources = [
      { id: 'window:8', name: 'Path of Exile' },
      { id: 'window:9', name: 'Path of Exile 2' },
    ]
    expect(matchGameWindowSource(sources, 'Path of Exile')).toBe('window:8')
    expect(matchGameWindowSource([sources[1]], 'Path of Exile')).toBeNull()
  })

  it('falls back to a prefix match for custom or whitespace-suffixed titles', () => {
    expect(matchGameWindowSource([{ id: 'window:3', name: 'Path of Exile 2  ' }], 'Path of Exile 2')).toBe('window:3')
    expect(matchGameWindowSource([{ id: 'window:4', name: 'My Custom PoE  ' }], 'My Custom PoE')).toBe('window:4')
  })

  it('rejects launcher and utility sources even when they borrow the game title', () => {
    expect(matchGameWindowSource([{ id: 'window:5', name: 'Steam' }], 'Path of Exile')).toBeNull()
    expect(matchGameWindowSource([{ id: 'window:6', name: 'Path of Exile Trade' }], 'Path of Exile')).toBeNull()
    expect(matchGameWindowSource([{ id: 'window:7', name: 'PoE Wiki' }], 'Path of Exile')).toBeNull()
  })

  it('uses the active title to avoid PoE1/PoE2 cross-attach', () => {
    const sources = [
      { id: 'window:1', name: 'Path of Exile' },
      { id: 'window:2', name: 'Path of Exile 2' },
    ]
    expect(matchGameWindowSource(sources, 'Path of Exile 2')).toBe('window:2')
  })

  it('returns null when nothing matches', () => {
    const sources = [{ id: 'window:4', name: 'Notepad' }]
    expect(matchGameWindowSource(sources, 'Path of Exile')).toBeNull()
  })
})

describe('matchBestGameWindowSource', () => {
  it('rejects utility sources without an active title', () => {
    expect(
      matchBestGameWindowSource([{ id: 'window:1', name: 'Path of Exile Wiki' }], ['Path of Exile', 'Path of Exile 2']),
    ).toBeNull()
  })
})
