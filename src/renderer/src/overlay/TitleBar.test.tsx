// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { getGameFeatures } from '@shared/game-features'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleBar } from './TitleBar'

describe('TitleBar', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test'
  })

  it('keeps close outside the overflowing plugin tab strip', () => {
    const onClose = vi.fn()
    render(
      <TitleBar
        view="no-item"
        overlayData={null}
        poeVersion={1}
        features={getGameFeatures(1)}
        hasPriceCheckData={false}
        hiddenTabs={new Set()}
        hiddenPluginTabIds={new Set()}
        pluginTabs={Array.from({ length: 12 }, (_, index) => ({
          pluginId: `plugin-${index + 1}`,
          label: `Plugin ${index + 1}`,
          icon: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>',
        }))}
        onSetView={vi.fn()}
        onClose={onClose}
        onMouseDown={vi.fn()}
      />,
    )

    const pluginTabs = screen.getByRole('navigation', { name: 'Plugin tabs' })
    const close = screen.getByRole('button', { name: 'Close' })

    expect(pluginTabs).toHaveClass('min-w-0', 'overflow-x-auto')
    expect(pluginTabs).not.toContainElement(close)
    expect(close.parentElement).toHaveClass('shrink-0')

    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
