// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeSettings } from '../../../../../shared/types'
import { ViewTab } from './ViewTab'

const baseSettings = {
  overlayScale: 1,
  poeVersion: 1,
  hiddenTabs: [],
  hiddenPluginTabIds: [],
  openSide: 'both',
  closeOnClickOutside: false,
  currencyLabelsAsText: false,
} as unknown as RuntimeSettings

beforeEach(() => {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    pluginListRegisteredTabs: vi.fn(async () => [
      { pluginId: 'acme.tool', label: 'Acme', icon: '<svg data-testid="acme-icon"/>' },
    ]),
    onPluginTabsChanged: vi.fn(() => () => {}),
  }
})

afterEach(() => vi.restoreAllMocks())

describe('ViewTab plugin tab toggles', () => {
  it('renders a toggle for each registered plugin tab', async () => {
    render(<ViewTab settings={baseSettings} update={vi.fn()} updateMany={vi.fn()} />)
    await waitFor(() => expect(screen.getByTitle('Acme')).toBeInTheDocument())
  })

  it('writes hiddenPluginTabIds when a visible plugin tab is clicked', async () => {
    const update = vi.fn()
    render(<ViewTab settings={baseSettings} update={update} updateMany={vi.fn()} />)
    const btn = await screen.findByTitle('Acme')
    fireEvent.click(btn)
    expect(update).toHaveBeenCalledWith('hiddenPluginTabIds', ['acme.tool'])
  })

  it('removes the id when an already-hidden plugin tab is clicked', async () => {
    const update = vi.fn()
    render(
      <ViewTab
        settings={{ ...baseSettings, hiddenPluginTabIds: ['acme.tool'] }}
        update={update}
        updateMany={vi.fn()}
      />,
    )
    const btn = await screen.findByTitle('Acme')
    fireEvent.click(btn)
    expect(update).toHaveBeenCalledWith('hiddenPluginTabIds', [])
  })
})
