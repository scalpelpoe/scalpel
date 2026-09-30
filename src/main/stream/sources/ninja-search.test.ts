import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStreamerSearch } from './ninja-search'

const fixture = new Uint8Array(readFileSync(resolve(__dirname, '../__fixtures__/ninja-search.bin')))

// Minimal builder for the search payload shape: result (field 1) -> columns (field 12),
// each column an id (field 1) plus its string values (field 7).
const utf8 = new TextEncoder()
function varint(n: number): number[] {
  const out: number[] = []
  for (; n > 0x7f; n >>>= 7) out.push((n & 0x7f) | 0x80)
  return [...out, n]
}
function lenField(field: number, payload: ArrayLike<number>): number[] {
  return [...varint((field << 3) | 2), ...varint(payload.length), ...Array.from(payload)]
}
function searchPayload(columns: Record<string, string[]>): Uint8Array {
  const result = Object.entries(columns).flatMap(([id, values]) =>
    lenField(12, [...lenField(1, utf8.encode(id)), ...values.flatMap((v) => lenField(7, utf8.encode(v)))]),
  )
  return new Uint8Array(lenField(1, result))
}

describe('parseStreamerSearch', () => {
  it('reads row-aligned characters, most recently seen first', () => {
    const rows = parseStreamerSearch(fixture)
    expect(rows).toHaveLength(7)
    expect(rows[0]).toEqual({
      name: 'GassiusClay',
      account: 'aer0_-2690',
      league: 'Forbidden Rites',
      level: 95,
      streamer: 'aer0__',
    })
    expect(rows.map((r) => r.league)).toContain('SSF Runes of Aldur')
    expect(rows.every((r) => r.account.length > 0 && typeof r.level === 'number')).toBe(true)
    expect(rows.every((r) => r.streamer === 'aer0__')).toBe(true)
  })

  it('lowercases the streamer login each row belongs to', () => {
    const rows = parseStreamerSearch(
      searchPayload({ name: ['A', 'B'], account: ['a-1', 'b-2'], 'streamer.login': ['AlkaizerX', 'aer0__'] }),
    )
    expect(rows.map((r) => r.streamer)).toEqual(['alkaizerx', 'aer0__'])
  })

  it('throws on payloads without the name/account columns', () => {
    // A single empty result message: field 1, length 0.
    expect(() => parseStreamerSearch(new Uint8Array([0x0a, 0x00]))).toThrow(/name\/account/)
  })

  it('throws when rows do not say which streamer they belong to', () => {
    expect(() => parseStreamerSearch(searchPayload({ name: ['A'], account: ['a-1'] }))).toThrow(/streamer/)
    expect(() =>
      parseStreamerSearch(searchPayload({ name: ['A', 'B'], account: ['a-1', 'b-2'], 'streamer.login': ['x'] })),
    ).toThrow(/streamer/)
  })

  it('throws on bytes that are not protobuf', () => {
    expect(() => parseStreamerSearch(new TextEncoder().encode('<html>'))).toThrow()
  })
})
