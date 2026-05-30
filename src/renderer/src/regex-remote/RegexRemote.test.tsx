// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegexRemote } from './RegexRemote'
import type { RegexPreset } from '../../../shared/types'

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

beforeEach(() => {
  apply.mockReset()
  ;(window as unknown as { api: unknown }).api = {
    getOverlayState: () => Promise.resolve({ poeVersion: 1, panelState: {}, gameBounds: null }),
    getRegexPresets: () => Promise.resolve([]),
    getSettings: () => Promise.resolve({ appMacros: [] }),
    onRegexPresetsChanged: () => () => {},
    regexRemoteApply: apply,
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
      Promise.resolve({ poeVersion: 2, panelState: {}, gameBounds: null }) as ReturnType<
        typeof window.api.getOverlayState
      >
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
})
