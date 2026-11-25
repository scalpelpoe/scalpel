// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ScryingOrbPriceChip } from './ScryingOrbPriceChip'

describe('ScryingOrbPriceChip', () => {
  it('shows the chaos price with the Scrying Orb icon and a ninja tooltip', () => {
    const { container, getByAltText } = render(<ScryingOrbPriceChip area="Dunes" chaosValue={8} divineRate={172} />)
    expect(container.textContent).toBe('8')
    expect(getByAltText('Scrying Orb').getAttribute('src')).toContain('ScryingOrb.png')
    expect(container.firstElementChild?.getAttribute('title')).toBe('Scrying Orb (Dunes) price on poe.ninja')
  })

  it('promotes a price over one divine to divines', () => {
    const { container } = render(<ScryingOrbPriceChip area="Necropolis" chaosValue={1393} divineRate={172} />)
    expect(container.textContent).toBe('8.1')
  })

  it('renders an empty, untitled cell when the area is unpriced', () => {
    const { container, queryByAltText } = render(
      <ScryingOrbPriceChip area="Colonnade" chaosValue={undefined} divineRate={172} />,
    )
    expect(container.textContent).toBe('')
    expect(queryByAltText('Scrying Orb')).toBeNull()
    expect(container.firstElementChild?.hasAttribute('title')).toBe(false)
  })
})
