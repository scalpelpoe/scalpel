// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegexRemote } from './RegexRemote'
import type { RegexPreset } from '@shared/types'

// sortablejs needs real drag events, which jsdom can't produce. Stand in a
// plain list that hands the component's setList back to the test, so the
// reorder path can be driven directly.
const sortLists: Array<(next: RegexPreset[]) => void> = []
vi.mock('react-sortablejs', () => ({
  ReactSortable: ({
    children,
    setList,
    className,
  }: {
    children: React.ReactNode
    setList: (next: RegexPreset[]) => void
    className?: string
  }) => {
    sortLists.push(setList)
    return <div className={className}>{children}</div>
  },
}))

function preset(over: Partial<RegexPreset>): RegexPreset {
  return {
    id: 'p1',
    name: 'My Maps',
    generator: 'maps',
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: {},
    nightmare: false,
    regex: 'aaa',
    ...over,
  }
}

const apply = vi.fn()
const reorder = vi.fn(() => Promise.resolve([]))

beforeEach(() => {
  apply.mockReset()
  reorder.mockReset()
  sortLists.length = 0
  ;(window as unknown as { api: unknown }).api = {
    getOverlayState: () => Promise.resolve({ poeVersion: 1, gameBounds: null }),
    getRegexPresets: () => Promise.resolve([]),
    getSettings: () => Promise.resolve({ appMacros: [] }),
    onRegexPresetsChanged: () => () => {},
    regexRemoteApply: apply,
    reorderRegexPresets: reorder,
    regexRemoteMountState: () => Promise.resolve(true),
    onRegexRemoteMountChanged: () => () => {},
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RegexRemote', () => {
  it('renders the empty-state hint when there are no presets', async () => {
    render(<RegexRemote />)
    expect(await screen.findByText(/Save regex presets/i)).toBeInTheDocument()
  })

  it('groups presets by generator and applies on chip click', async () => {
    window.api.getRegexPresets = () =>
      Promise.resolve([
        preset({ id: 'm1', name: 'High Tier', generator: 'maps' }),
        preset({ id: 'c1', name: 'Vendor', generator: 'custom' }),
      ])
    render(<RegexRemote />)
    expect(await screen.findByText('Maps')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
    fireEvent.click(screen.getByText('High Tier'))
    expect(apply).toHaveBeenCalledWith('m1')
  })

  it('uses PoE2 generator order when poeVersion is 2', async () => {
    window.api.getOverlayState = () =>
      Promise.resolve({ poeVersion: 2, gameBounds: null }) as ReturnType<typeof window.api.getOverlayState>
    window.api.getRegexPresets = () =>
      Promise.resolve([
        preset({ id: 'w1', name: 'Red Maps', generator: 'waystones' }),
        preset({ id: 'c2', name: 'My Custom', generator: 'custom' }),
      ])
    render(<RegexRemote />)
    expect(await screen.findByText('Waystones')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.queryByText('Flasks')).not.toBeInTheDocument()
  })

  it('renders a reorder grip per entry', async () => {
    window.api.getRegexPresets = () =>
      Promise.resolve([
        preset({ id: 'm1', name: 'High Tier', generator: 'maps' }),
        preset({ id: 'm2', name: 'Low Tier', generator: 'maps' }),
      ])
    render(<RegexRemote />)
    expect(await screen.findByTestId('grab-m1')).toBeInTheDocument()
    expect(screen.getByTestId('grab-m2')).toBeInTheDocument()
  })

  it('keeps the chip tint on the wrapper and the button see-through', async () => {
    // styles.css paints `button:hover`/`:active` with a grey overlay that
    // outranks a bg-transparent class, so the inline transparent below is the
    // only thing stopping a hover from washing the preset colour out.
    window.api.getRegexPresets = () =>
      Promise.resolve([preset({ id: 'm1', name: 'High Tier', generator: 'maps', color: '#7c3aed' })])
    render(<RegexRemote />)
    const row = (await screen.findByTestId('grab-m1')).parentElement as HTMLElement
    expect(row.style.background).toBe('rgb(124, 58, 237)')
    expect((row.querySelector('button') as HTMLElement).style.background).toBe('transparent')
  })

  it('clicking the grip does not apply the preset', async () => {
    window.api.getRegexPresets = () => Promise.resolve([preset({ id: 'm1', name: 'High Tier', generator: 'maps' })])
    render(<RegexRemote />)
    fireEvent.click(await screen.findByTestId('grab-m1'))
    expect(apply).not.toHaveBeenCalled()
  })

  it('persists a drag as the full preset order, leaving other groups alone', async () => {
    window.api.getRegexPresets = () =>
      Promise.resolve([
        preset({ id: 'm1', name: 'High Tier', generator: 'maps' }),
        preset({ id: 'c1', name: 'My Custom', generator: 'custom' }),
        preset({ id: 'm2', name: 'Low Tier', generator: 'maps' }),
      ])
    render(<RegexRemote />)
    await screen.findByText('High Tier')
    // First sortable list is the Maps group; drag Low Tier above High Tier.
    sortLists[0]([preset({ id: 'm2', generator: 'maps' }), preset({ id: 'm1', generator: 'maps' })])
    await waitFor(() => expect(reorder).toHaveBeenCalledWith(['m2', 'c1', 'm1']))
  })

  it('ignores the setList calls that fire without a user drag', async () => {
    window.api.getRegexPresets = () =>
      Promise.resolve([
        preset({ id: 'm1', name: 'High Tier', generator: 'maps' }),
        preset({ id: 'm2', name: 'Low Tier', generator: 'maps' }),
      ])
    render(<RegexRemote />)
    await screen.findByText('High Tier')
    sortLists[0]([preset({ id: 'm1', generator: 'maps' }), preset({ id: 'm2', generator: 'maps' })])
    expect(reorder).not.toHaveBeenCalled()
  })
})
