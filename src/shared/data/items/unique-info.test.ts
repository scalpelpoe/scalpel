import { describe, expect, it } from 'vitest'
import uniqueInfo from './unique-info.json'

describe('unique-info.json', () => {
  it('covers flask bases (issue #509)', () => {
    const data = uniqueInfo as Record<string, string[]>
    expect(data['Sulphur Flask']).toContain('Bottled Faith')
    const flaskKeys = Object.keys(data).filter((k) => /Flask$/.test(k))
    expect(flaskKeys.length).toBeGreaterThanOrEqual(20)
  })

  it('keeps keys sorted and each value array sorted and duplicate-free', () => {
    const data = uniqueInfo as Record<string, string[]>
    const keys = Object.keys(data)
    const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b))
    expect(keys).toEqual(sortedKeys)

    for (const [base, names] of Object.entries(data)) {
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b))
      expect(names, `${base} names should be sorted`).toEqual(sortedNames)
      expect(new Set(names).size, `${base} names should be duplicate-free`).toBe(names.length)
    }
  })
})
