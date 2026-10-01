import { PriceCheckSchema } from '@scalpel/stream-contract'
import { describe, expect, it } from 'vitest'
import real from './price-checks-real.json'
import fixtures from './price-checks.json'

describe.each([
  ['price-checks.json', fixtures],
  ['price-checks-real.json', real],
])('%s', (_name, data) => {
  it('parses every entry with PriceCheckSchema', () => {
    const entries = Object.entries(data as Record<string, unknown>)
    expect(entries.length).toBeGreaterThan(0)
    for (const [key, value] of entries) {
      const r = PriceCheckSchema.safeParse(value)
      expect(r.success, `${key}: ${r.success ? '' : r.error.message}`).toBe(true)
    }
  })
})
