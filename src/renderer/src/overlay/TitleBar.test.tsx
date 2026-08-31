// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react'
import { getGameFeatures } from '@shared/game-features'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleBar } from './TitleBar'

describe('TitleBar', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test'
  })

  function renderTitleBar(pluginTabs: Array<{ pluginId: string; label: string; icon: string }>, onClose = vi.fn()) {
    render(
      <TitleBar
        view="no-item"
        overlayData={null}
        poeVersion={1}
        features={getGameFeatures(1)}
        hasPriceCheckData={false}
        hiddenTabs={new Set()}
        hiddenPluginTabIds={new Set()}
        pluginTabs={pluginTabs}
        onSetView={vi.fn()}
        onClose={onClose}
        onMouseDown={vi.fn()}
      />,
    )
    return { onClose }
  }

  it('wraps the 12th-and-beyond icons into a second row, keeping close in row one', () => {
    const { onClose } = renderTitleBar(
      Array.from({ length: 12 }, (_, index) => ({
        pluginId: `plugin-${index + 1}`,
        label: `Plugin ${index + 1}`,
        icon: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>',
      })),
    )

    const overflow = screen.getByRole('navigation', { name: 'Plugin tabs' })
    expect(within(overflow).getAllByRole('button')).toHaveLength(9)
    expect(within(overflow).queryByTitle('Plugin 3')).toBeNull()
    expect(within(overflow).getByTitle('Plugin 4')).toBeInTheDocument()

    const close = screen.getByRole('button', { name: 'Close' })
    expect(overflow).not.toContainElement(close)

    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders no overflow row when the plugin tabs fit in row one', () => {
    renderTitleBar(
      Array.from({ length: 3 }, (_, index) => ({
        pluginId: `plugin-${index + 1}`,
        label: `Plugin ${index + 1}`,
        icon: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>',
      })),
    )

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByTitle('Plugin 1')).toBeInTheDocument()
    expect(screen.getByTitle('Plugin 2')).toBeInTheDocument()
    expect(screen.getByTitle('Plugin 3')).toBeInTheDocument()
  })
})
