// @vitest-environment jsdom
import type { Card, StreamSnapshot } from '@scalpel/stream-contract'
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
    expect(helm.querySelector('.ssv-rune')).not.toHaveAttribute('title')
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

  it('links to the streamer build guide and item filters', () => {
    const snapshot = sampleSnapshot()
    snapshot.links = {
      filters: 'https://www.pathofexile.com/account/view-profile/Example-1234/item-filters',
      buildGuide: 'https://youtu.be/guide',
    }
    renderPanel(snapshot)
    const guide = screen.getByRole('link', { name: 'Build Guide ↗' })
    const filters = screen.getByRole('link', { name: 'Item Filters ↗' })
    expect(guide).toHaveAttribute('href', 'https://youtu.be/guide')
    expect(filters).toHaveAttribute(
      'href',
      'https://www.pathofexile.com/account/view-profile/Example-1234/item-filters',
    )
    for (const a of [guide, filters]) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('renders only the build guide when there are no filters', () => {
    const snapshot = sampleSnapshot()
    snapshot.links = { filters: null, buildGuide: 'https://example.com/guide' }
    renderPanel(snapshot)
    expect(screen.getByRole('link', { name: 'Build Guide ↗' })).toHaveAttribute('href', 'https://example.com/guide')
    expect(screen.queryByRole('link', { name: 'Item Filters ↗' })).toBeNull()
  })

  it('renders no stream links when the snapshot has none', () => {
    const snapshot = sampleSnapshot()
    snapshot.links = undefined
    renderPanel(snapshot)
    expect(screen.queryByRole('link', { name: 'Build Guide ↗' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Item Filters ↗' })).toBeNull()
  })
})

describe('GearPanel price check', () => {
  const withPriceCheck = () => {
    const snapshot = sampleSnapshot()
    const helm = snapshot.equipment.Helm
    if (!helm) throw new Error('sample has no helm')
    helm.priceCheck = {
      league: 'Fate of the Vaal',
      body: { query: { stats: [{ type: 'and', filters: [{ id: 'explicit.stat_life', value: { min: 72 } }] }] } },
      rows: [
        {
          id: 'explicit.stat_life',
          text: '+72 to maximum Life',
          type: 'explicit',
          value: 72,
          min: 72,
          max: null,
          defaultEnabled: true,
          locked: false,
          offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }],
          minPath: ['query', 'stats', 0, 'filters', 0, 'value', 'min'],
          maxPath: ['query', 'stats', 0, 'filters', 0, 'value', 'max'],
        },
      ],
    }
    return snapshot
  }

  it('swaps the pinned card for the panel and restores it on tab switch', () => {
    renderPanel(withPriceCheck())
    fireEvent.click(screen.getByLabelText('Helmet: Grim Veil'))
    fireEvent.click(screen.getByRole('button', { name: 'Price check' }))
    expect(screen.getByRole('link', { name: /Search on trade/ })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).toBeNull()
    // Hovering another slot does not replace the panel.
    fireEvent.mouseEnter(screen.getByLabelText('Body armour: Morior Invictus'))
    expect(screen.getByRole('link', { name: /Search on trade/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Gear' }))
    expect(screen.queryByRole('link', { name: /Search on trade/ })).toBeNull()
    fireEvent.click(screen.getByLabelText('Helmet: Grim Veil'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('goes back to the card and offers no button for items without a price check', () => {
    renderPanel(withPriceCheck())
    fireEvent.click(screen.getByLabelText('Helmet: Grim Veil'))
    fireEvent.click(screen.getByRole('button', { name: 'Price check' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to item' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Grim Veil')
    fireEvent.click(screen.getByLabelText('Body armour: Morior Invictus'))
    expect(screen.queryByRole('button', { name: 'Price check' })).toBeNull()
  })

  it('only offers the button on a pinned item, not a hover', () => {
    renderPanel(withPriceCheck())
    fireEvent.mouseEnter(screen.getByLabelText('Helmet: Grim Veil'))
    expect(screen.queryByRole('button', { name: 'Price check' })).toBeNull()
  })

  describe('gem, support and rune cards', () => {
    const card = (name: string, line: string, rarity: 'gem' | 'currency' = 'gem'): Card => ({
      name,
      baseType: name,
      rarity,
      icon: 'https://x/y.webp',
      properties: [],
      requirements: [],
      sections: [{ kind: 'description', lines: [{ text: line }] }],
    })
    const withCards = (): StreamSnapshot => {
      const s = sampleSnapshot()
      s.skills[0].gem.card = card('Lightning Arrow', 'Fires a bolt of lightning.')
      s.skills[0].supports[0].card = card('Pierce', 'Supports projectile skills.')
      s.equipment.Helm!.sockets[0].card = card('Greater Rune of Leadership', 'Rune text here.', 'currency')
      return s
    }
    const toSkills = (): void => {
      fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    }

    it('shows a gem card on hover', () => {
      renderPanel(withCards())
      toSkills()
      const row = screen.getByText('Lightning Arrow').closest('[data-card]') as HTMLElement
      fireEvent.mouseEnter(row)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Fires a bolt of lightning.')
      expect(screen.queryByRole('button', { name: 'Price check' })).toBeNull()
      fireEvent.mouseLeave(row)
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('shows a support card on hover', () => {
      renderPanel(withCards())
      toSkills()
      fireEvent.mouseEnter(screen.getByText('Pierce').closest('[data-card]') as HTMLElement)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Supports projectile skills.')
    })

    it('pins on click and unpins on a second click', () => {
      renderPanel(withCards())
      toSkills()
      const chip = screen.getByText('Pierce').closest('[data-card]') as HTMLElement
      fireEvent.click(chip)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Pierce')
      fireEvent.click(chip)
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('leaves entries without a card inert', () => {
      renderPanel(withCards())
      toSkills()
      const chip = screen.getByText('Magnified Area')
      expect(chip).not.toHaveAttribute('data-card')
      // Already inside the row (mouseEnter alone would also enter it): a chip with no card changes nothing.
      fireEvent.mouseOver(chip, { relatedTarget: chip.parentElement })
      fireEvent.click(chip)
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('clears a pinned gem card on tab switch', () => {
      renderPanel(withCards())
      toSkills()
      fireEvent.click(screen.getByText('Pierce').closest('[data-card]') as HTMLElement)
      fireEvent.click(screen.getByRole('tab', { name: 'Gear' }))
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('shows the rune card while a rune is hovered, then the item card again', () => {
      const { container } = renderPanel(withCards())
      fireEvent.click(screen.getByRole('button', { name: 'I' }))
      const helm = screen.getByLabelText('Helmet: Grim Veil')
      fireEvent.mouseEnter(helm)
      const rune = helm.querySelector('.ssv-rune') as HTMLElement
      fireEvent.mouseEnter(rune)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Rune text here.')
      expect(container.querySelector('.ssv-tooltip')).toHaveAttribute('data-frame', 'white')
      // Pointer moves from the rune back onto its slot (mouseLeave alone would also leave the slot).
      fireEvent.mouseOut(rune, { relatedTarget: helm })
      expect(screen.getByRole('tooltip')).toHaveTextContent('Grim Veil')
    })

    it('shows a hovered gem over a pinned card and returns to the pin on leave', () => {
      renderPanel(withCards())
      toSkills()
      fireEvent.click(screen.getByText('Pierce').closest('[data-card]') as HTMLElement)
      const row = screen.getByText('Lightning Arrow').closest('[data-card]') as HTMLElement
      fireEvent.mouseEnter(row)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Fires a bolt of lightning.')
      fireEvent.mouseLeave(row)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Supports projectile skills.')
    })

    it('clears a hovered or pinned rune card on tab switch', () => {
      renderPanel(withCards())
      const helm = screen.getByLabelText('Helmet: Grim Veil')
      fireEvent.mouseEnter(helm)
      const rune = helm.querySelector('.ssv-rune') as HTMLElement
      fireEvent.mouseEnter(rune)
      fireEvent.click(rune)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Rune text here.')
      fireEvent.click(screen.getByRole('tab', { name: 'Skills' }))
      expect(screen.queryByRole('tooltip')).toBeNull()
      fireEvent.click(screen.getByRole('tab', { name: 'Gear' }))
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('takes pointer events for a pinned item with a rune card, so the sockets line can be hovered', () => {
      const { container } = renderPanel(withCards(), sampleHead(), 'side')
      const helm = screen.getByLabelText('Helmet: Grim Veil')
      fireEvent.mouseEnter(helm)
      const wrap = container.querySelector('.ssv-overlay-tooltip') as HTMLElement
      expect(wrap).not.toHaveClass('!pointer-events-auto')
      fireEvent.click(helm)
      expect(wrap).toHaveClass('!pointer-events-auto')
    })

    it('makes carded gem rows and support chips keyboard operable', () => {
      renderPanel(withCards())
      toSkills()
      const row = screen.getByText('Lightning Arrow').closest('[data-card]') as HTMLElement
      expect(row).toHaveAttribute('role', 'button')
      expect(row).toHaveAttribute('tabindex', '0')
      fireEvent.focus(row)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Fires a bolt of lightning.')
      fireEvent.blur(row)
      expect(screen.queryByRole('tooltip')).toBeNull()
      fireEvent.keyDown(row, { key: 'Enter' })
      fireEvent.blur(row)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Fires a bolt of lightning.')
      fireEvent.keyDown(row, { key: ' ' })
      expect(screen.queryByRole('tooltip')).toBeNull()
      const chip = screen.getByText('Pierce').closest('[data-card]') as HTMLElement
      expect(chip).toHaveAttribute('role', 'button')
      fireEvent.keyDown(chip, { key: 'Enter' })
      expect(screen.getByRole('tooltip')).toHaveTextContent('Supports projectile skills.')
      // A card-less chip is not a tab stop.
      expect(screen.getByText('Magnified Area')).not.toHaveAttribute('tabindex')
    })

    it('keeps a gem card click-through on the overlay, even pinned', () => {
      const { container } = renderPanel(withCards(), sampleHead(), 'side')
      toSkills()
      const chip = screen.getByText('Pierce').closest('[data-card]') as HTMLElement
      fireEvent.mouseEnter(chip)
      const wrap = container.querySelector('.ssv-overlay-tooltip') as HTMLElement
      expect(wrap).toBeInTheDocument()
      expect(wrap).not.toHaveClass('!pointer-events-auto')
      fireEvent.click(chip)
      expect(wrap).not.toHaveClass('!pointer-events-auto')
    })
  })

  describe('side placement pointer events', () => {
    const wrapper = (container: HTMLElement): HTMLElement => container.querySelector('.ssv-overlay-tooltip') as HTMLElement

    it('leaves a hovered card click-through, but takes pointer events for a pinned card and the checker', () => {
      const { container } = renderPanel(withPriceCheck(), sampleHead(), 'side')
      const helm = screen.getByLabelText('Helmet: Grim Veil')
      fireEvent.mouseEnter(helm)
      expect(wrapper(container)).not.toHaveClass('!pointer-events-auto')
      fireEvent.click(helm)
      expect(wrapper(container)).toHaveClass('!pointer-events-auto', '!overflow-y-auto')
      fireEvent.click(screen.getByRole('button', { name: 'Price check' }))
      expect(wrapper(container)).toHaveClass('!pointer-events-auto', '!overflow-y-auto')
    })

    it('keeps a pinned card without a price check click-through', () => {
      const { container } = renderPanel(withPriceCheck(), sampleHead(), 'side')
      fireEvent.click(screen.getByLabelText('Body armour: Morior Invictus'))
      expect(wrapper(container)).not.toHaveClass('!pointer-events-auto')
    })
  })
})
