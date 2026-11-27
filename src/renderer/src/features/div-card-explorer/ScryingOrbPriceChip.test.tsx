// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScryingOrbPriceChip } from './ScryingOrbPriceChip'

afterEach(() => {
  vi.useRealTimers()
})

describe('ScryingOrbPriceChip', () => {
  it('shows the chaos price under the Scrying Orb icon', () => {
    const { container, getByAltText } = render(<ScryingOrbPriceChip area="Dunes" chaosValue={8} divineRate={172} />)
    expect(container.textContent).toBe('8')
    expect(getByAltText('Scrying Orb').getAttribute('src')).toContain('ScryingOrb.png')
  })

  it('promotes a price over one divine to divines', () => {
    const { container } = render(<ScryingOrbPriceChip area="Necropolis" chaosValue={1393} divineRate={172} />)
    expect(container.textContent).toBe('8.1')
  })

  it('names the area and the source in its hover tooltip', () => {
    vi.useFakeTimers()
    render(<ScryingOrbPriceChip area="Dunes" chaosValue={8} divineRate={172} />)
    fireEvent.mouseEnter(screen.getByText('8'))
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(screen.getByTestId('hover-tooltip').textContent).toBe('Scrying Orb (Dunes) on poe.ninja')
  })

  it('renders an empty spacer when the area is unpriced', () => {
    const { container, queryByAltText } = render(
      <ScryingOrbPriceChip area="Colonnade" chaosValue={undefined} divineRate={172} />,
    )
    expect(container.textContent).toBe('')
    expect(queryByAltText('Scrying Orb')).toBeNull()
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })
})
