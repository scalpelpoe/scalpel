// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeTwitch, jsonResponse, sampleHead, sampleSnapshot } from '../test-helpers'
import { MobileView, OverlayView, PanelView } from './TwitchViews'

function stubApi(head: () => Response = () => jsonResponse(sampleHead())) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.includes('/heads/') ? head() : jsonResponse(sampleSnapshot()))),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('OverlayView', () => {
  it('opens the gear panel from the edge tab', async () => {
    stubApi()
    const twitch = fakeTwitch()
    render(<OverlayView ext={twitch.ext} />)
    act(() => twitch.authorize())
    expect(screen.queryByText('SampleExile')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'GEAR' }))
    expect(await screen.findByText('SampleExile')).toBeInTheDocument()
  })

  it('fades the tab while the player controls are hidden', () => {
    stubApi()
    const twitch = fakeTwitch()
    render(<OverlayView ext={twitch.ext} />)
    act(() => twitch.context({ arePlayerControlsVisible: false }))
    expect(screen.getByRole('button', { name: 'GEAR' })).toHaveClass('ssv-dim')
  })

  it('says so when the channel has no Scalpel Stream profile', async () => {
    stubApi(() => jsonResponse({ error: 'not found' }, 404))
    const twitch = fakeTwitch()
    render(<OverlayView ext={twitch.ext} />)
    act(() => twitch.authorize())
    fireEvent.click(screen.getByRole('button', { name: 'GEAR' }))
    expect(await screen.findByText(/hasn't set up Scalpel Stream/)).toBeInTheDocument()
  })
})

describe('MobileView and PanelView', () => {
  it('render the gear without an edge tab', async () => {
    stubApi()
    const mobile = fakeTwitch()
    render(<MobileView ext={mobile.ext} />)
    act(() => mobile.authorize())
    expect(await screen.findByText('SampleExile')).toBeInTheDocument()
  })

  it('panel lists equipped items and respects the hidden state', async () => {
    stubApi(() => jsonResponse(sampleHead({ state: 'hidden' })))
    const panel = fakeTwitch()
    render(<PanelView ext={panel.ext} />)
    act(() => panel.authorize())
    expect(await screen.findByText(/hidden their gear/)).toBeInTheDocument()
  })

  it('panel expands a row into its card', async () => {
    stubApi()
    const panel = fakeTwitch()
    render(<PanelView ext={panel.ext} />)
    act(() => panel.authorize())
    fireEvent.click(await screen.findByText('Grim Veil'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('+62 to maximum Energy Shield')
  })
})
