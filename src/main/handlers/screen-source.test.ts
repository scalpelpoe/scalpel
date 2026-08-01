import { describe, it, expect } from 'vitest'
import { matchGameWindowSource } from './screen-source'

describe('matchGameWindowSource', () => {
  it('prefers an exact title match', () => {
    const sources = [
      { id: 'window:1', name: 'Discord' },
      { id: 'window:2', name: 'Path of Exile' },
    ]
    expect(matchGameWindowSource(sources, 'Path of Exile')).toBe('window:2')
  })

  it('does not match PoE1 title against a PoE2 window', () => {
    const sources = [{ id: 'window:9', name: 'Path of Exile 2' }]
    expect(matchGameWindowSource(sources, 'Path of Exile')).toBeNull()
  })

  it('falls back to a prefix match when no exact title exists', () => {
    const sources = [{ id: 'window:3', name: 'Path of Exile 2  ' }]
    expect(matchGameWindowSource(sources, 'Path of Exile 2')).toBe('window:3')
  })

  it('returns null when nothing matches', () => {
    const sources = [{ id: 'window:4', name: 'Notepad' }]
    expect(matchGameWindowSource(sources, 'Path of Exile')).toBeNull()
  })
})
