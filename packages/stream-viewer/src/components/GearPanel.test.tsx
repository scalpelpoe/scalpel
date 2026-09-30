// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sampleHead, sampleSnapshot } from '../test-helpers'
import { GearPanel } from './GearPanel'

const now = Date.parse('2026-09-29T12:20:00Z')

function renderPanel(snapshot = sampleSnapshot(), head = sampleHead(), placement: 'side' | 'below' = 'below') {
  return render(<GearPanel snapshot={snapshot} head={head} now={now} placement={placement} />)
}

describe('GearPanel', () => {
  it('shows the ascendancy portrait, name, level and update age', () => {
    renderPanel()
    expect(screen.getByText('SampleExile')).toBeInTheDocument()
    expect(screen.getByText('Level 92 Deadeye')).toBeInTheDocument()
    expect(screen.getByAltText('Deadeye')).toHaveAttribute('src', 'https://assets.poe.ninja/poe2/classes/deadeye.webp')
    expect(screen.getByText('Updated 9m')).toBeInTheDocument()
    expect(screen.queryByText(/synced/)).toBeNull()
  })

  it('adds when poe.ninja last synced the gear once it lags the publish', () => {
    const snapshot = sampleSnapshot()
    snapshot.source.updatedUtc = '2026-09-29T09:05:00Z'
    renderPanel(snapshot)
    expect(screen.getByText('· synced 3h')).toBeInTheDocument()
  })

  it('lays out the paperdoll with the active weapon set and patched slots', () => {
    const { container } = renderPanel()
    expect(screen.getByLabelText('Helmet: Grim Veil')).toBeInTheDocument()
    // Sample is on weapon set II (bow + quiver).
    expect(screen.getByLabelText('Main hand: Rage Song')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I' }))
    expect(screen.getByLabelText('Main hand: Doom Knell')).toBeInTheDocument()
    expect(screen.getByLabelText('Off hand: empty')).toBeDisabled()
    expect(container.querySelectorAll('.ssv-patched')).toHaveLength(1)
  })

  it('lines the belt up like the game: life flask, charms, mana flask', () => {
    const belt = (): Array<string | null> =>
      screen.getAllByRole('button', { name: /^(Flask|Charm):/ }).map((b) => b.getAttribute('aria-label'))
    const view = renderPanel()
    expect(belt()).toEqual([
      'Flask: Concentrated Ultimate Life Flask of the Surgeon',
      'Charm: Thawing Charm of the Ox',
      'Flask: Saturated Lesser Mana Flask of the Chemist',
    ])
    view.unmount()

    // A lone mana flask still sits on the right.
    const snapshot = sampleSnapshot()
    snapshot.flasks = snapshot.flasks.filter((f) => f.baseType.endsWith('Mana Flask'))
    renderPanel(snapshot)
    expect(belt()).toEqual(['Charm: Thawing Charm of the Ox', 'Flask: Saturated Lesser Mana Flask of the Chemist'])
  })

  it('previews on hover and pins on click', () => {
    renderPanel()
    const helm = screen.getByLabelText('Helmet: Grim Veil')
    fireEvent.mouseEnter(helm)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ancestral Tiara')
    fireEvent.mouseLeave(helm)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(helm)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Grim Veil')
    fireEvent.click(helm)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('names empty slots and carries each item its runes for hover', () => {
    const { container } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'I' }))
    expect(screen.getByLabelText('Off hand: empty')).toHaveTextContent('Off hand')
    const helm = screen.getByLabelText('Helmet: Grim Veil')
    expect(helm.querySelectorAll('.ssv-rune')).toHaveLength(1)
    expect(helm.querySelector('.ssv-rune')).toHaveAttribute('title', 'Greater Rune of Leadership')
    // Socketless items get no overlay.
    expect(screen.getByLabelText('Body armour: Morior Invictus').querySelector('.ssv-runes')).toBeNull()
    expect(container.querySelectorAll('.ssv-runes').length).toBeGreaterThan(0)
  })

  it('drops the side item card when switching tabs', () => {
    renderPanel(sampleSnapshot(), sampleHead(), 'side')
    const helm = screen.getByLabelText('Helmet: Grim Veil')
    fireEvent.mouseEnter(helm)
    fireEvent.click(helm)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    // No mouseleave: the pointer can jump straight to the tab bar.
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Gear' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('switches between gear, skills, jewels and keystones', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    expect(screen.getByText('Lightning Arrow')).toBeInTheDocument()
    expect(screen.getByText('Lightning Penetration')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Jewels/ }))
    expect(screen.getByLabelText('Jewel: Storm Heart')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Keystones' }))
    expect(screen.getByText('Resonance')).toBeInTheDocument()
    expect(screen.getByText('Gain Power Charges instead of Frenzy Charges')).toBeInTheDocument()
    expect(document.querySelector('img[src$="/passives/resonancekeystone.webp"]')).not.toBeNull()
    // A keystone without art still lists its name and text.
    expect(screen.getByText('Triple Attribute requirements of Martial Weapons')).toBeInTheDocument()
  })

  it('flags paused channels and stale gear', () => {
    const snapshot = sampleSnapshot()
    snapshot.publishedUtc = '2026-09-29T06:00:00Z'
    renderPanel(snapshot, sampleHead({ state: 'paused' }))
    expect(screen.getByText(/Paused by the streamer/)).toBeInTheDocument()
    expect(screen.getByText('Updated 6h')).toHaveClass('ssv-stale')
  })

  it('hides the name when the streamer does', () => {
    const snapshot = sampleSnapshot()
    snapshot.character.name = null
    renderPanel(snapshot)
    expect(screen.getByText('Hidden character')).toBeInTheDocument()
  })

  it('copies the PoB code, falling back to a selectable box', async () => {
    const snapshot = sampleSnapshot()
    snapshot.pob = 'eNrtfXtz2zq'
    const writeText = vi.fn(async () => {
      throw new Error('blocked')
    })
    Object.assign(navigator, { clipboard: { writeText } })
    renderPanel(snapshot)
    fireEvent.click(screen.getByRole('button', { name: 'Copy PoB' }))
    expect(await screen.findByLabelText('Path of Building code')).toHaveValue('eNrtfXtz2zq')
  })

  it('disables Copy PoB without an export and links to Scalpel', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Copy PoB' })).toBeDisabled()
    expect(screen.getByText('Powered by Scalpel ↗')).toHaveAttribute('href', 'https://live.scalpel.fourth.party/')
  })
})
