// @vitest-environment jsdom
import type { PriceCheck, PriceCheckRow, SnapshotItem } from '@scalpel/stream-contract'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sampleSnapshot } from '../test-helpers'
import { PriceCheckPanel, parseBound } from './PriceCheckPanel'

const row = (over: Partial<PriceCheckRow>): PriceCheckRow => ({
  id: 'explicit.stat_life',
  text: '+72 to maximum Life',
  type: 'explicit',
  value: 72,
  min: 72,
  max: null,
  defaultEnabled: true,
  locked: false,
  offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }],
  minPath: ['query', 'stats', 0, 'filters', 0, 'value', 'min'],
  maxPath: ['query', 'stats', 0, 'filters', 0, 'value', 'max'],
  ...over,
})

const pc = (): PriceCheck => ({
  league: 'Fate of the Vaal',
  body: {
    query: {
      status: { option: 'online' },
      stats: [
        {
          type: 'and',
          filters: [
            { id: 'explicit.stat_life', value: { min: 72 } },
            { id: 'explicit.stat_fire', value: { min: 36 } },
          ],
        },
      ],
    },
    sort: { price: 'asc' },
  },
  rows: [
    row({}),
    row({
      id: 'explicit.stat_fire',
      text: '+36% to Fire Resistance',
      value: 36,
      min: 36,
      offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 1] }],
      minPath: ['query', 'stats', 0, 'filters', 1, 'value', 'min'],
      maxPath: ['query', 'stats', 0, 'filters', 1, 'value', 'max'],
    }),
    row({
      id: 'misc.corrupted',
      text: 'Corrupted',
      type: 'misc',
      value: null,
      min: null,
      locked: true,
      offOps: [],
      minPath: null,
      maxPath: null,
    }),
  ],
})

const item = (check: PriceCheck = pc()): SnapshotItem & { priceCheck: PriceCheck } => ({
  ...(sampleSnapshot().equipment.Ring as SnapshotItem),
  priceCheck: check,
})

const href = (): string => screen.getByRole('link', { name: /Search on trade/ }).getAttribute('href') ?? ''
const query = (): { query: { stats: Array<{ filters: Array<Record<string, unknown>> }> } } =>
  JSON.parse(decodeURIComponent(new URL(href()).search.slice(3)))

describe('PriceCheckPanel', () => {
  it('renders one row per price-check row under the item header', () => {
    render(<PriceCheckPanel item={item()} onBack={() => {}} />)
    expect(screen.getByText('+72 to maximum Life')).toBeInTheDocument()
    expect(screen.getByText('+36% to Fire Resistance')).toBeInTheDocument()
    expect(screen.getByText('Corrupted')).toBeInTheDocument()
    expect(screen.getByText('Plague Loop')).toHaveClass('ssv-r-rare')
  })

  it('opens the trade search in a new tab', () => {
    render(<PriceCheckPanel item={item()} onBack={() => {}} />)
    const link = screen.getByRole('link', { name: /Search on trade/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(href()).toMatch(/^https:\/\/www\.pathofexile\.com\/trade2\/search\/poe2\/Fate%20of%20the%20Vaal\?q=/)
  })

  it('toggling a row disables its stat in the search link, and Reset restores it', () => {
    render(<PriceCheckPanel item={item()} onBack={() => {}} />)
    expect(query().query.stats[0].filters[0].disabled).toBeUndefined()
    fireEvent.click(screen.getByText('+72 to maximum Life'))
    expect(query().query.stats[0].filters[0].disabled).toBe(true)
    expect(query().query.stats[0].filters[1].disabled).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(query().query.stats[0].filters[0].disabled).toBeUndefined()
  })

  it('does not toggle locked rows', () => {
    render(<PriceCheckPanel item={item()} onBack={() => {}} />)
    const before = href()
    const locked = screen.getByText('Corrupted')
    fireEvent.click(locked)
    expect(href()).toBe(before)
    expect(locked.closest('[title="Fixed for this search"]')).not.toHaveClass('pointer-events-none')
  })

  it('renders a locked chip as applied: active colour, default cursor, titled', () => {
    render(<PriceCheckPanel item={item()} onBack={() => {}} />)
    const before = href()
    const chip = screen.getByText('Corrupted').closest('div') as HTMLElement
    expect(chip.style.opacity).toBe('1')
    expect(chip.style.cursor).toBe('default')
    expect(chip.style.color).not.toBe('var(--text-dim)')
    expect(chip.style.background).not.toBe('rgba(0, 0, 0, 0.25)')
    fireEvent.click(chip)
    expect(href()).toBe(before)
    expect(chip.closest('span')).toHaveAttribute('title', 'Fixed for this search')
  })

  it('calls onBack from the back arrow', () => {
    const onBack = vi.fn()
    render(<PriceCheckPanel item={item()} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to item' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  describe('editing bounds', () => {
    const type = (current: string, next: string): void => {
      fireEvent.click(screen.getByText(current))
      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: next } })
      fireEvent.keyDown(input, { key: 'Enter' })
    }
    const minAt = (i: number): unknown =>
      (query().query.stats[0].filters[i] as { value: { min?: number | null } }).value.min

    it('writes an edited min to the row minPath', () => {
      render(<PriceCheckPanel item={item()} onBack={() => {}} />)
      type('72', '80')
      expect(minAt(0)).toBe(80)
      expect(minAt(1)).toBe(36)
    })

    it('clearing a min sets it to null', () => {
      render(<PriceCheckPanel item={item()} onBack={() => {}} />)
      type('72', '')
      expect(minAt(0)).toBeNull()
    })

    it('hides the min box when the row has no minPath', () => {
      const check = pc()
      check.rows[1] = { ...check.rows[1], minPath: null }
      render(<PriceCheckPanel item={item(check)} onBack={() => {}} />)
      expect(screen.queryByText('36')).toBeNull()
    })

    it('hides the max box when the row has no maxPath', () => {
      const check = pc()
      check.rows[1] = { ...check.rows[1], maxPath: null }
      render(<PriceCheckPanel item={item(check)} onBack={() => {}} />)
      expect(screen.getAllByText('max')).toHaveLength(1)
    })

    it('ignores edits to a locked row', () => {
      const check = pc()
      check.rows[2] = { ...check.rows[2], type: 'explicit', min: 5, value: 5, minPath: ['query', 'stats', 0, 'filters', 0, 'value', 'min'] }
      render(<PriceCheckPanel item={item(check)} onBack={() => {}} />)
      const before = href()
      type('5', '9')
      expect(href()).toBe(before)
    })
  })

  describe('chip strip', () => {
    const yesno = (text: string, def: 'yes' | 'no' | 'none', states: NonNullable<PriceCheckRow['chip']>['states']): PriceCheckRow =>
      row({
        id: 'misc.corrupted',
        text,
        type: 'misc',
        value: null,
        min: null,
        max: null,
        offOps: [],
        minPath: null,
        maxPath: null,
        defaultEnabled: def !== 'none',
        chip: { mode: 'yesno', default: def, states },
      })
    const corruptedPath = ['query', 'filters', 'misc_filters', 'filters', 'corrupted']
    const ternary = (): PriceCheckRow =>
      yesno('Corrupted', 'no', {
        no: [],
        yes: [{ op: 'set', path: [...corruptedPath, 'option'], value: 'true' }],
        none: [{ op: 'delete', path: corruptedPath }],
      })
    const ilvlPath = ['query', 'filters', 'type_filters', 'filters', 'ilvl']
    const minmax = (): PriceCheckRow =>
      row({
        id: 'misc.ilvl',
        text: 'Item Level: 83',
        type: 'misc',
        value: 83,
        min: 83,
        max: null,
        defaultEnabled: false,
        offOps: [],
        minPath: null,
        maxPath: null,
        chip: {
          mode: 'minmax',
          default: 'none',
          states: {
            none: [],
            min: [{ op: 'set', path: ilvlPath, value: { min: 83 } }],
            max: [{ op: 'set', path: ilvlPath, value: { max: 83 } }],
          },
        },
      })
    const withRows = (...extra: PriceCheckRow[]): PriceCheck => {
      const base = pc()
      base.rows = [base.rows[0], ...extra]
      ;(base.body.query as Record<string, unknown>).filters = {
        misc_filters: { filters: { corrupted: { option: 'false' } } },
        type_filters: { filters: {} },
      }
      return base
    }
    const filters = (): { misc_filters?: { filters: Record<string, unknown> }; type_filters?: { filters: Record<string, unknown> } } =>
      (query().query as unknown as { filters: never }).filters

    it('renders misc rows as chips above the stat rows and leaves stats as rows', () => {
      render(<PriceCheckPanel item={item(withRows(ternary()))} onBack={() => {}} />)
      const chip = screen.getByText('Corrupted')
      expect(chip.closest('[data-chip-strip]')).not.toBeNull()
      expect(screen.getByText('+72 to maximum Life').closest('[data-chip-strip]')).toBeNull()
      expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    })

    it('a ternary chip cycles No -> Any -> Yes -> No and the Search link follows', () => {
      render(<PriceCheckPanel item={item(withRows(ternary()))} onBack={() => {}} />)
      expect(filters().misc_filters?.filters).toEqual({ corrupted: { option: 'false' } })
      // yesno cycle from No: Any (undefined)
      fireEvent.click(screen.getByText('Corrupted'))
      expect(filters().misc_filters).toBeUndefined()
      fireEvent.click(screen.getByText('Corrupted'))
      expect(filters().misc_filters?.filters).toEqual({ corrupted: { option: 'true' } })
      expect(screen.getByText('Yes')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Corrupted'))
      expect(filters().misc_filters?.filters).toEqual({ corrupted: { option: 'false' } })
    })

    it('skips states the chip does not offer', () => {
      const only = yesno('Corrupted', 'no', { no: [], yes: [{ op: 'set', path: [...corruptedPath, 'option'], value: 'true' }] })
      render(<PriceCheckPanel item={item(withRows(only))} onBack={() => {}} />)
      fireEvent.click(screen.getByText('Corrupted'))
      expect(filters().misc_filters?.filters).toEqual({ corrupted: { option: 'true' } })
      fireEvent.click(screen.getByText('Corrupted'))
      expect(filters().misc_filters?.filters).toEqual({ corrupted: { option: 'false' } })
    })

    it('a minmax chip goes Off -> min-only -> max-only -> Off', () => {
      render(<PriceCheckPanel item={item(withRows(minmax()))} onBack={() => {}} />)
      expect(filters().type_filters).toBeUndefined()
      fireEvent.click(screen.getByText('Item Level: 83'))
      expect(filters().type_filters?.filters.ilvl).toEqual({ min: 83 })
      fireEvent.click(screen.getByText('Item Level: 83'))
      expect(filters().type_filters?.filters.ilvl).toEqual({ max: 83 })
      fireEvent.click(screen.getByText('Item Level: 83'))
      expect(filters().type_filters).toBeUndefined()
    })

    it('a binary chip toggles its own offOps', () => {
      const binary = row({
        id: 'misc.quality',
        text: 'Quality: 20',
        type: 'misc',
        value: 20,
        min: null,
        max: null,
        offOps: [{ op: 'delete', path: ['query', 'filters', 'misc_filters', 'filters', 'quality'] }],
        minPath: null,
        maxPath: null,
      })
      const check = withRows(binary)
      ;(check.body.query as { filters: { misc_filters: { filters: Record<string, unknown> } } }).filters.misc_filters.filters.quality = {
        min: 20,
      }
      render(<PriceCheckPanel item={item(check)} onBack={() => {}} />)
      expect(filters().misc_filters?.filters.quality).toEqual({ min: 20 })
      fireEvent.click(screen.getByText('Quality: 20'))
      expect(filters().misc_filters?.filters.quality).toBeUndefined()
      fireEvent.click(screen.getByText('Quality: 20'))
      expect(filters().misc_filters?.filters.quality).toEqual({ min: 20 })
    })

    it('locked chips render applied and cannot change', () => {
      const lockedRow = row({
        id: 'misc.identified',
        text: 'Identified: Yes',
        type: 'misc',
        value: null,
        min: null,
        max: null,
        locked: true,
        offOps: [],
        minPath: null,
        maxPath: null,
      })
      render(<PriceCheckPanel item={item(withRows(lockedRow))} onBack={() => {}} />)
      const before = href()
      const chip = screen.getByText('Identified: Yes')
      expect(chip.closest('[data-chip-strip]')).not.toBeNull()
      fireEvent.click(chip)
      expect(href()).toBe(before)
      expect(chip.closest('[title="Fixed for this search"]')).not.toBeNull()
    })

    it('Reset restores chip defaults', () => {
      render(<PriceCheckPanel item={item(withRows(ternary()))} onBack={() => {}} />)
      fireEvent.click(screen.getByText('Corrupted'))
      expect(filters().misc_filters).toBeUndefined()
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      expect(filters().misc_filters?.filters).toEqual({ corrupted: { option: 'false' } })
    })
  })

  it('takes the card width it is given', () => {
    render(<PriceCheckPanel item={item()} width={333} onBack={() => {}} />)
    const panel = screen.getByRole('region', { name: 'Price check' })
    expect(panel).toHaveStyle({ width: '333px' })
    expect(panel).toHaveClass('ssv-pc')
  })

  it('parses bound strings: empty is null, junk is ignored', () => {
    expect(parseBound('')).toBeNull()
    expect(parseBound('  ')).toBeNull()
    expect(parseBound('abc')).toBeUndefined()
    expect(parseBound('Infinity')).toBeUndefined()
    expect(parseBound('12.5')).toBe(12.5)
  })
})
