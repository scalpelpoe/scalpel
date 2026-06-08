// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PoeVersionProvider } from './poe-version-context'
import { CurrencyLabelsProvider } from './currency-labels-context'

// Currency icon URLs come from imported PNGs; in vitest the imports resolve
// to path strings. Mock the currency-icons module wholesale - the component only
// uses getCurrencyIconMap from it, so a partial mock is sufficient and avoids
// having to resolve the influence-icon PNGs and item-icons JSON during the
// real import.
vi.mock('./currency-icons', () => ({
  getCurrencyIconMap: () => ({
    chaos: 'chaos.png',
    divine: 'divine.png',
    exa: 'exalted.png',
    exalted: 'exalted.png',
  }),
}))

import { CurrencyIcon } from './CurrencyIcon'

function wrap(node: React.ReactNode, opts?: { textMode?: boolean; version?: 1 | 2 }): React.ReactElement {
  return (
    <PoeVersionProvider version={opts?.version ?? 1}>
      <CurrencyLabelsProvider value={opts?.textMode ?? false}>{node}</CurrencyLabelsProvider>
    </PoeVersionProvider>
  )
}

describe('CurrencyIcon', () => {
  it('renders an <img> by default', () => {
    const { container } = render(wrap(<CurrencyIcon name="chaos" className="w-3 h-3" />))
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('chaos.png')
    expect(img?.getAttribute('class')).toContain('w-3')
    expect(container.querySelector('span')).toBeNull()
  })

  it('renders a <span> with the short label when text mode is on', () => {
    const { container } = render(wrap(<CurrencyIcon name="chaos" className="w-3 h-3" />, { textMode: true }))
    expect(container.querySelector('img')).toBeNull()
    const span = container.querySelector('span')
    expect(span?.textContent).toBe('c')
  })

  it('uses "ex" for exalted in text mode', () => {
    const { container } = render(wrap(<CurrencyIcon name="exalted" />, { textMode: true, version: 2 }))
    expect(container.querySelector('span')?.textContent).toBe('ex')
  })

  it('falls back to the trade key for unknown currencies in text mode', () => {
    const { container } = render(wrap(<CurrencyIcon name="made-up" />, { textMode: true }))
    expect(container.querySelector('span')?.textContent).toBe('made-up')
  })

  it('falls back to small dim text for unknown currencies in icon mode', () => {
    const { container } = render(wrap(<CurrencyIcon name="made-up" />))
    expect(container.querySelector('img')).toBeNull()
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-text-dim')
    expect(span?.className).toContain('text-[10px]')
    expect(span?.className).not.toContain('font-semibold')
    expect(span?.textContent).toBe('made-up')
  })

  it('forwards the style prop to the rendered element', () => {
    const { container } = render(wrap(<CurrencyIcon name="chaos" style={{ width: 24, height: 24 }} />))
    const img = container.querySelector('img') as HTMLImageElement | null
    expect(img?.style.width).toBe('24px')
    expect(img?.style.height).toBe('24px')
  })

  it('defaults alt to the short label and respects an explicit alt', () => {
    const a = render(wrap(<CurrencyIcon name="chaos" />))
    const imgA = a.container.querySelector('img')
    expect(imgA?.getAttribute('alt')).toBe('c')

    const b = render(wrap(<CurrencyIcon name="chaos" alt="Chaos Orb" />))
    const imgB = b.container.querySelector('img')
    expect(imgB?.getAttribute('alt')).toBe('Chaos Orb')
  })
})
