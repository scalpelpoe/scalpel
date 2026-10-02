import type { PriceCheck, PriceCheckRow } from '@scalpel/stream-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { applyEdits, initialEdits, tradeSearchUrl, type RowEdit } from './trade-link'

describe('trade-link', () => {
  function buildTestPriceCheck(): PriceCheck {
    // Hand-built PriceCheck with 2 stat rows and 1 ilvl row (ilvl defaults off)
    // Uses realistic body structure with trade_filters and type_filters
    const row0: PriceCheckRow = {
      id: 'explicit.stat_life',
      text: '+72 to maximum Life',
      type: 'explicit',
      value: 72,
      min: 72,
      max: null,
      defaultEnabled: true,
      locked: false,
      offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }],
      minPath: ['query', 'stats', 0, 'filters', 0, 'min'],
      maxPath: null,
    }

    const row1: PriceCheckRow = {
      id: 'explicit.stat_armour',
      text: '+100 to Armour',
      type: 'explicit',
      value: 100,
      min: 100,
      max: null,
      defaultEnabled: true,
      locked: false,
      offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 1] }],
      minPath: ['query', 'stats', 0, 'filters', 1, 'min'],
      maxPath: null,
    }

    const row2: PriceCheckRow = {
      id: 'misc.ilvl',
      text: 'Item Level',
      type: 'misc',
      value: null,
      min: 70,
      max: null,
      defaultEnabled: false, // ilvl defaults off
      locked: false,
      offOps: [{ op: 'delete', path: ['query', 'filters', 'misc_filters', 'filters', 'ilvl'] }],
      minPath: ['query', 'filters', 'misc_filters', 'filters', 'ilvl', 'min'],
      maxPath: null,
    }

    const body = {
      query: {
        status: { option: 'any' },
        stats: [
          {
            type: 'and',
            filters: [
              {
                id: 'explicit.stat_life',
                min: 72,
              },
              {
                id: 'explicit.stat_armour',
                min: 100,
              },
            ],
          },
        ],
        filters: {
          trade_filters: {
            disabled: false,
            filters: {
              collapse: { option: 'true' },
            },
          },
          misc_filters: {
            filters: {
              ilvl: { min: 70 },
            },
          },
          type_filters: {
            filters: {
              rarity: { option: 'rare' },
            },
          },
        },
      },
    }

    return {
      league: 'Rise of the Abyssal',
      body,
      rows: [row0, row1, row2],
    }
  }

  describe('initialEdits', () => {
    it('creates edits from rows with defaultEnabled and min/max values', () => {
      const pc = buildTestPriceCheck()
      const edits = initialEdits(pc.rows)

      expect(edits).toEqual([
        { enabled: true, min: 72, max: null },
        { enabled: true, min: 100, max: null },
        { enabled: false, min: 70, max: null },
      ])
    })
  })

  describe('applyEdits', () => {
    it('applies offOps for disabled rows', () => {
      const pc = buildTestPriceCheck()
      const edits = initialEdits(pc.rows)
      // edits[2] (ilvl) has enabled: false by default
      const edited = applyEdits(pc, edits)

      // Should have query key
      expect(edited.query).toBeDefined()
      // The ilvl filter should be deleted
      const query = edited.query as Record<string, unknown>
      const filters = query.filters as Record<string, unknown> | undefined
      // misc_filters should be pruned (empty after ilvl is deleted)
      expect(filters?.misc_filters).toBeUndefined()
      // Original body should be unchanged
      expect((pc.body.query as Record<string, unknown>).filters).toBeDefined()
      const originalFilters = (pc.body.query as Record<string, unknown>).filters as Record<string, unknown>
      expect(originalFilters.misc_filters).toBeDefined()
    })

    it('sets disabled: true when turning a stat row off', () => {
      const pc = buildTestPriceCheck()
      const edits = initialEdits(pc.rows)
      edits[0].enabled = false // Turn off the life row
      const edited = applyEdits(pc, edits)

      const query = edited.query as Record<string, unknown>
      const stats = query.stats as Array<Record<string, unknown>>
      const filters = stats[0].filters as Array<Record<string, unknown>>
      const filter0 = filters[0]
      expect(filter0.disabled).toBe(true)
    })

    it('writes min at minPath when edited', () => {
      const pc = buildTestPriceCheck()
      const edits = initialEdits(pc.rows)
      edits[0].min = 50 // Change life min from 72 to 50
      const edited = applyEdits(pc, edits)

      const query = edited.query as Record<string, unknown>
      const stats = query.stats as Array<Record<string, unknown>>
      const filters = stats[0].filters as Array<Record<string, unknown>>
      const filter0 = filters[0] as Record<string, unknown>
      expect(filter0.min).toBe(50)
    })

    it('ignores locked rows', () => {
      const pc = buildTestPriceCheck()
      pc.rows[1].locked = true
      const edits = initialEdits(pc.rows)
      edits[1].min = 999 // Try to change locked row's min
      const edited = applyEdits(pc, edits)

      const query = edited.query as Record<string, unknown>
      const stats = query.stats as Array<Record<string, unknown>>
      const filters = stats[0].filters as Array<Record<string, unknown>>
      const filter1 = filters[1] as Record<string, unknown>
      // Should still be 100, not 999
      expect(filter1.min).toBe(100)
    })

    it('does not mutate the original pc.body', () => {
      const pc = buildTestPriceCheck()
      const originalBody = structuredClone(pc.body)
      const edits = initialEdits(pc.rows)
      edits[0].min = 50
      applyEdits(pc, edits)

      // Original body should be unchanged
      expect(pc.body).toEqual(originalBody)
    })

    it('handles undefined edits array entry gracefully', () => {
      const pc = buildTestPriceCheck()
      const edits: Array<RowEdit | undefined> = [{ enabled: true, min: 72, max: null }, undefined]
      const edited = applyEdits(pc, edits)

      // Should not throw and produce valid output
      expect(edited).toBeDefined()
      expect(edited.query).toBeDefined()
    })

    it('preserves body.query when only empty groups remain', () => {
      // Regression test: a body whose only group is trade_filters with empty filters
      const pc: PriceCheck = {
        league: 'Rise of the Abyssal',
        body: {
          query: {
            status: { option: 'any' },
            filters: {
              trade_filters: {
                disabled: false,
                filters: {},
              },
            },
          },
        },
        rows: [],
      }
      const edited = applyEdits(pc, [])

      // body.query must still exist with status intact
      expect(edited.query).toBeDefined()
      const query = edited.query as Record<string, unknown>
      expect(query.status).toEqual({ option: 'any' })
      expect(query.filters).toBeDefined()
    })

    it('preserves body.query when all toggleable rows are turned off', () => {
      // Regression test: all rows disabled means all groups deleted, but query survives
      const pc = buildTestPriceCheck()
      // Disable all rows
      const edits: RowEdit[] = pc.rows.map(() => ({ enabled: false, min: null, max: null }))
      const edited = applyEdits(pc, edits)

      // body.query and query.filters must still exist
      expect(edited.query).toBeDefined()
      const query = edited.query as Record<string, unknown>
      expect(query.status).toBeDefined()
      expect(query.filters).toBeDefined()
    })
  })

  describe('tradeSearchUrl', () => {
    it('builds a URL with the correct league and encoded query', () => {
      const pc = buildTestPriceCheck()
      const edits = initialEdits(pc.rows)
      const url = tradeSearchUrl(pc, edits)

      expect(url).toMatch(/^https:\/\/www\.pathofexile\.com\/trade2\/search\/poe2\/Rise%20of%20the%20Abyssal\?q=/)

      // Decode and verify the query matches applyEdits output
      const qMatch = url.match(/\?q=(.+)$/)
      expect(qMatch).not.toBeNull()
      const decodedQuery = JSON.parse(decodeURIComponent(qMatch![1]))
      const expectedBody = applyEdits(pc, edits)
      expect(decodedQuery).toEqual({
        ...expectedBody,
        query: { ...(expectedBody.query as object), status: { option: 'securable' } },
      })
    })

    const bodyOf = (pc: PriceCheck) =>
      JSON.parse(decodeURIComponent(tradeSearchUrl(pc, initialEdits(pc.rows)).split('?q=')[1])) as {
        query: Record<string, unknown>
      }

    it('forces Instant Buyout without mutating the snapshot body', () => {
      const pc = buildTestPriceCheck()
      ;(pc.body as { query: Record<string, unknown> }).query.status = { option: 'available' }
      expect(bodyOf(pc).query.status).toEqual({ option: 'securable' })
      expect((pc.body as { query: { status: unknown } }).query.status).toEqual({ option: 'available' })
    })

    it('flattens legacy-discriminator type/name to plain text (rune bases)', () => {
      const pc = buildTestPriceCheck()
      const q = (pc.body as { query: Record<string, unknown> }).query
      q.type = { option: 'Runemastered Stone Greaves', discriminator: 'legacy' }
      q.name = { option: 'Birth of Fury', discriminator: 'legacy' }
      const out = bodyOf(pc).query
      expect(out.type).toBe('Runemastered Stone Greaves')
      expect(out.name).toBe('Birth of Fury')
      expect(q.type).toEqual({ option: 'Runemastered Stone Greaves', discriminator: 'legacy' })
    })

    it('leaves other discriminator forms and plain strings alone', () => {
      const pc = buildTestPriceCheck()
      const q = (pc.body as { query: Record<string, unknown> }).query
      q.type = { option: 'Waystone', discriminator: 'map' }
      q.name = 'Plain'
      const out = bodyOf(pc).query
      expect(out.type).toEqual({ option: 'Waystone', discriminator: 'map' })
      expect(out.name).toBe('Plain')
    })

    it('encodes special characters in league name', () => {
      const pc = buildTestPriceCheck()
      pc.league = 'Test League & Special'
      const edits = initialEdits(pc.rows)
      const url = tradeSearchUrl(pc, edits)

      expect(url).toMatch(/Test%20League%20%26%20Special/)
    })
  })
  describe('chips', () => {
    const chipPc = (): PriceCheck => ({
      league: 'L',
      body: {
        query: {
          status: { option: 'available' },
          filters: {
            type_filters: { filters: { rarity: { option: 'nonunique' } } },
            misc_filters: { filters: { corrupted: { option: 'false' } } },
          },
          stats: [{ type: 'and', filters: [{ id: 'a', value: { min: 5 } }] }],
        },
      },
      rows: [
        {
          id: 'misc.corrupted',
          text: 'Corrupted',
          type: 'misc',
          value: null,
          min: null,
          max: null,
          defaultEnabled: true,
          locked: false,
          offOps: [],
          minPath: null,
          maxPath: null,
          chip: {
            mode: 'yesno',
            default: 'no',
            states: {
              no: [],
              yes: [{ op: 'set', path: ['query', 'filters', 'misc_filters', 'filters', 'corrupted', 'option'], value: 'true' }],
              none: [{ op: 'delete', path: ['query', 'filters', 'misc_filters', 'filters', 'corrupted'] }],
            },
          },
        },
        {
          id: 'misc.ilvl',
          text: 'Item Level: 83',
          type: 'misc',
          value: 83,
          min: 83,
          max: null,
          defaultEnabled: false,
          locked: false,
          offOps: [],
          minPath: null,
          maxPath: null,
          chip: {
            mode: 'minmax',
            default: 'none',
            states: {
              none: [],
              min: [{ op: 'set', path: ['query', 'filters', 'type_filters', 'filters', 'ilvl'], value: { min: 83 } }],
              max: [{ op: 'set', path: ['query', 'filters', 'type_filters', 'filters', 'ilvl'], value: { max: 83 } }],
            },
          },
        },
        {
          id: 'a',
          text: 'a',
          type: 'explicit',
          value: 5,
          min: 5,
          max: null,
          defaultEnabled: true,
          locked: false,
          offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }],
          minPath: ['query', 'stats', 0, 'filters', 0, 'value', 'min'],
          maxPath: null,
        },
      ],
    })
    type Body = { query: { filters: Record<string, { filters: Record<string, unknown> } | undefined>; stats: Array<{ filters: Array<{ value: { min: number } }> }> } }
    const misc = (b: Record<string, unknown>): Record<string, unknown> | undefined =>
      (b as unknown as Body).query.filters.misc_filters?.filters
    const ilvl = (b: Record<string, unknown>): unknown => (b as unknown as Body).query.filters.type_filters?.filters.ilvl

    it('initialEdits carries the chip default', () => {
      const edits = initialEdits(chipPc().rows)
      expect(edits.map((e) => e.chip)).toEqual(['no', 'none', undefined])
    })

    it('the default state leaves the body alone', () => {
      const pc = chipPc()
      const b = applyEdits(pc, initialEdits(pc.rows))
      expect(misc(b)).toEqual({ corrupted: { option: 'false' } })
      expect(ilvl(b)).toBeUndefined()
    })

    it('a set op overwrites an existing leaf', () => {
      const pc = chipPc()
      const edits = initialEdits(pc.rows)
      edits[0] = { ...edits[0], chip: 'yes' }
      expect(misc(applyEdits(pc, edits))).toEqual({ corrupted: { option: 'true' } })
    })

    it('a delete state drops the filter (Any)', () => {
      const pc = chipPc()
      const edits = initialEdits(pc.rows)
      edits[0] = { ...edits[0], chip: 'none' }
      expect(misc(applyEdits(pc, edits))).toBeUndefined()
    })

    it('a set op creates missing parent objects', () => {
      const pc = chipPc()
      delete (pc.body as unknown as Body).query.filters.type_filters
      const edits = initialEdits(pc.rows)
      edits[1] = { ...edits[1], chip: 'min' }
      expect(ilvl(applyEdits(pc, edits))).toEqual({ min: 83 })
    })

    it('minmax states write min-only then max-only even though the row defaults off', () => {
      const pc = chipPc()
      const edits = initialEdits(pc.rows)
      edits[1] = { ...edits[1], chip: 'min' }
      expect(ilvl(applyEdits(pc, edits))).toEqual({ min: 83 })
      edits[1] = { ...edits[1], chip: 'max' }
      expect(ilvl(applyEdits(pc, edits))).toEqual({ max: 83 })
    })

    it('chip ops apply before bound writes of other rows', () => {
      const pc = chipPc()
      const edits = initialEdits(pc.rows)
      edits[0] = { ...edits[0], chip: 'yes' }
      edits[2] = { ...edits[2], min: 9 }
      const b = applyEdits(pc, edits)
      expect((b as unknown as Body).query.stats[0].filters[0].value.min).toBe(9)
      expect(misc(b)).toEqual({ corrupted: { option: 'true' } })
    })

    it('every ternary state decodes from the URL to the expected body', () => {
      const pc = chipPc()
      for (const [state, want] of [
        ['no', { corrupted: { option: 'false' } }],
        ['yes', { corrupted: { option: 'true' } }],
        ['none', undefined],
      ] as const) {
        const edits = initialEdits(pc.rows)
        edits[0] = { ...edits[0], chip: state }
        const q = new URL(tradeSearchUrl(pc, edits)).search.slice(3)
        expect(misc(JSON.parse(decodeURIComponent(q)))).toEqual(want)
      }
    })

    it('ignores a chip state the row does not offer', () => {
      const pc = chipPc()
      const edits = initialEdits(pc.rows)
      edits[1] = { ...edits[1], chip: 'yes' }
      expect(ilvl(applyEdits(pc, edits))).toBeUndefined()
    })
    describe('unsafe paths', () => {
      const polluted = (): unknown => ({} as Record<string, unknown>).polluted
      const withOp = (op: unknown, row: Partial<PriceCheckRow['chip']> = {}): PriceCheck => {
        const pc = chipPc()
        pc.rows[0].chip = { mode: 'yesno', default: 'no', states: { no: [], yes: [op as never] }, ...row }
        return pc
      }
      afterEach(() => {
        delete (Object.prototype as Record<string, unknown>).polluted
      })

      it.each([['__proto__'], ['constructor'], ['prototype']])('set through %s is a no-op', (key) => {
        const pc = withOp({ op: 'set', path: [key, 'polluted'], value: 1 })
        const edits = initialEdits(pc.rows)
        edits[0] = { ...edits[0], chip: 'yes' }
        applyEdits(pc, edits)
        expect(polluted()).toBeUndefined()
        expect(({} as { constructor: { polluted?: unknown } }).constructor.polluted).toBeUndefined()
      })

      it('set through a nested __proto__ is a no-op', () => {
        const pc = withOp({ op: 'set', path: ['query', '__proto__', 'polluted'], value: 1 })
        const edits = initialEdits(pc.rows)
        edits[0] = { ...edits[0], chip: 'yes' }
        applyEdits(pc, edits)
        expect(polluted()).toBeUndefined()
      })

      it('delete and disable through __proto__ do nothing', () => {
        const pc = chipPc()
        pc.rows[2].offOps = [
          { op: 'disable', path: ['__proto__', 'polluted'] },
          { op: 'delete', path: ['constructor', 'prototype', 'polluted'] },
        ]
        const edits = initialEdits(pc.rows)
        edits[2] = { ...edits[2], enabled: false }
        expect(() => applyEdits(pc, edits)).not.toThrow()
        expect(polluted()).toBeUndefined()
      })

      it('min/max writes through __proto__ do nothing', () => {
        const pc = chipPc()
        pc.rows[2].minPath = ['__proto__', 'polluted']
        const edits = initialEdits(pc.rows)
        edits[2] = { ...edits[2], min: 9 }
        applyEdits(pc, edits)
        expect(polluted()).toBeUndefined()
      })
    })

    it('a set replaces a non-object parent with an object', () => {
      const pc = chipPc()
      ;(pc.body as unknown as Body).query.filters.type_filters = 'oops' as never
      const edits = initialEdits(pc.rows)
      edits[1] = { ...edits[1], chip: 'min' }
      expect(ilvl(applyEdits(pc, edits))).toEqual({ min: 83 })
    })
  })
})
