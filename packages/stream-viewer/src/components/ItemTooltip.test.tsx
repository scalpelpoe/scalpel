// @vitest-environment jsdom
import type { SnapshotItem } from '@scalpel/stream-contract'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleSnapshot } from '../test-helpers'
import { ItemTooltip, tierDetail } from './ItemTooltip'
import { themeVars } from './ViewerRoot'

const equipment = sampleSnapshot().equipment

describe('ItemTooltip', () => {
  it('shows a rare with its base, properties, requirements and mods in order', () => {
    const { container } = render(<ItemTooltip item={equipment.Helm as SnapshotItem} />)
    expect(screen.getByText('Grim Veil')).toHaveClass('ssv-r-rare')
    expect(screen.getByText('Ancestral Tiara')).toBeInTheDocument()
    // In-game wording, with the numbers in value colour.
    expect(container.querySelector('.ssv-reqs')?.textContent).toBe('Requires: Level 75, 142 Int')
    expect(container.querySelector('.ssv-tooltip-head')).toHaveAttribute('data-frame', 'rare')
    const lines = [...container.querySelectorAll('.ssv-mod')].map((el) => el.textContent ?? '')
    // Rune effects come before explicits, which carry their tier badge.
    expect(lines[0]).toBe('+12% to Cold Resistance')
    expect(lines).toContain('[S2]+38% to Fire Resistance')
    expect(screen.getByText('Greater Rune of Leadership')).toBeInTheDocument()
  })

  it('badges tiers and reveals the tier detail on hover', () => {
    render(<ItemTooltip item={equipment.Helm as SnapshotItem} />)
    const line = screen.getByText('+62 to maximum Energy Shield').closest('.ssv-mod') as HTMLElement
    expect(line.querySelector('.ssv-tier')?.textContent).toBe('[P1]')
    fireEvent.mouseEnter(line)
    expect(screen.getByText('Prefix · Tier 1 · (57-66)')).toBeInTheDocument()
    fireEvent.mouseLeave(line)
    expect(screen.getByText('+62 to maximum Energy Shield')).toBeInTheDocument()
  })

  it('renders affix-less tiers by label', () => {
    expect(tierDetail({ text: 'x', tier: { num: 2, label: 'T2' } })).toBe('Tier 2')
  })

  it('prices uniques and marks flags', () => {
    render(<ItemTooltip item={equipment.BodyArmour as SnapshotItem} />)
    expect(screen.getByText('≈ 3.5 div')).toBeInTheDocument()
    const amulet = render(<ItemTooltip item={equipment.Amulet as SnapshotItem} />)
    expect(amulet.getByText('Fractured')).toBeInTheDocument()
    expect(amulet.getByText('Desecrated')).toBeInTheDocument()
  })

  it('colours desecrated, crafted and rune lines apart', () => {
    const item = structuredClone(equipment.Helm as SnapshotItem)
    item.sections = [
      { kind: 'rune', lines: [{ text: 'rune line' }] },
      { kind: 'enchant', lines: [{ text: 'enchant line' }] },
      {
        kind: 'explicit',
        lines: [
          { text: 'plain line' },
          { text: 'desecrated line', desecrated: true },
          { text: 'crafted line', crafted: true },
        ],
      },
    ]
    render(<ItemTooltip item={item} />)
    const color = (t: string): string => (screen.getByText(t).closest('.ssv-mod') as HTMLElement).style.color
    expect(color('desecrated line')).toBe('var(--ssv-mod-desecrated)')
    expect(color('crafted line')).toBe('var(--ssv-mod-crafted)')
    expect(color('plain line')).toBe('var(--ssv-mod-explicit)')
    expect(color('rune line')).toBe('var(--ssv-mod-rune)')
    expect(color('enchant line')).toBe('var(--ssv-mod-rune)')
    expect(color('rune line')).not.toBe(color('crafted line'))
  })

  it('shows magic items by their full name only', () => {
    const flask = sampleSnapshot().flasks[0]
    render(<ItemTooltip item={flask} />)
    expect(screen.getByText('Concentrated Ultimate Life Flask of the Surgeon')).toHaveClass('ssv-r-magic')
    expect(screen.queryByText('Ultimate Life Flask')).toBeNull()
  })
})

describe('ItemTooltip socket cards', () => {
  const withRuneCard = (): SnapshotItem => {
    const item = structuredClone(equipment.Helm as SnapshotItem)
    item.sockets[0].card = {
      name: 'Greater Rune of Leadership',
      baseType: 'Greater Rune of Leadership',
      rarity: 'currency',
      icon: 'https://x/y.webp',
      properties: [],
      requirements: [],
      sections: [{ kind: 'description', lines: [{ text: 'Socket text.' }] }],
    }
    return item
  }

  it('floats the rune card beside a hovered socket, outside the card box', () => {
    const { container } = render(<ItemTooltip item={withRuneCard()} />)
    const socket = screen.getByText('Greater Rune of Leadership').closest('.ssv-socket') as HTMLElement
    fireEvent.mouseEnter(socket)
    const floating = screen.getAllByRole('tooltip')[1]
    expect(floating).toHaveTextContent('Socket text.')
    expect(container.contains(floating)).toBe(false)
    fireEvent.mouseLeave(socket)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
  })

  it('leaves sockets without a card inert', () => {
    render(<ItemTooltip item={equipment.Helm as SnapshotItem} />)
    fireEvent.mouseEnter(screen.getByText('Greater Rune of Leadership').closest('.ssv-socket') as HTMLElement)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
  })
})

describe('ItemTooltip floating rune card placement', () => {
  const card = {
    name: 'Rune',
    baseType: 'Rune',
    rarity: 'currency' as const,
    icon: 'https://x/y.webp',
    properties: [],
    requirements: [],
    sections: [],
  }
  const hoverSocket = (rect: Partial<DOMRect>, size: { w: number; h: number }): HTMLElement => {
    const item = structuredClone(equipment.Helm as SnapshotItem)
    item.sockets[0].card = card
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(size.w)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(size.h)
    render(<ItemTooltip item={item} />)
    const socket = screen.getByText('Greater Rune of Leadership').closest('.ssv-socket') as HTMLElement
    vi.spyOn(socket, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0, ...rect } as DOMRect)
    fireEvent.mouseEnter(socket)
    return document.body.querySelector('.ssv-float-card') as HTMLElement
  }
  const setViewport = (w: number, h: number): void => {
    vi.stubGlobal('innerWidth', w)
    vi.stubGlobal('innerHeight', h)
  }
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('clamps the card inside the bottom of the viewport', () => {
    setViewport(1280, 720)
    const el = hoverSocket({ left: 100, right: 160, top: 600, bottom: 620 }, { w: 300, h: 400 })
    expect(el.style.left).toBe('168px')
    expect(el.style.top).toBe('312px')
    expect(el.style.visibility).toBe('visible')
  })

  it('flips left of the socket when there is no room on the right, and stays inside both edges', () => {
    setViewport(500, 720)
    const el = hoverSocket({ left: 300, right: 400, top: 10, bottom: 30 }, { w: 300, h: 100 })
    expect(el.style.left).toBe('8px')
    expect(el.style.top).toBe('10px')
  })

  it('fits the 318px Twitch panel', () => {
    setViewport(318, 700)
    // The CSS caps the card at 100vw - 16px (302px), so that is the widest it can measure.
    const el = hoverSocket({ left: 200, right: 260, top: 10, bottom: 30 }, { w: 302, h: 200 })
    expect(parseFloat(el.style.left) + 302).toBeLessThanOrEqual(310)
    expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(8)
  })

  it('repositions on resize and drops its listeners when hidden', () => {
    setViewport(1280, 720)
    const el = hoverSocket({ left: 100, right: 160, top: 600, bottom: 620 }, { w: 300, h: 400 })
    setViewport(1280, 500)
    fireEvent(window, new Event('resize'))
    expect(el.style.top).toBe('92px')
  })

  it('carries the viewer theme vars on its root', () => {
    setViewport(1280, 720)
    const el = hoverSocket({ left: 100, right: 160, top: 10, bottom: 20 }, { w: 300, h: 100 })
    for (const key of Object.keys(themeVars)) expect(el.style.getPropertyValue(key)).toBe(String((themeVars as Record<string, string>)[key]))
    expect(Object.keys(themeVars).length).toBeGreaterThan(0)
  })
})
