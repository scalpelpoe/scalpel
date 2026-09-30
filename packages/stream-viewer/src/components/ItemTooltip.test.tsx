// @vitest-environment jsdom
import type { SnapshotItem } from '@scalpel/stream-contract'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sampleSnapshot } from '../test-helpers'
import { ItemTooltip, tierDetail } from './ItemTooltip'

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

  it('shows magic items by their full name only', () => {
    const flask = sampleSnapshot().flasks[0]
    render(<ItemTooltip item={flask} />)
    expect(screen.getByText('Concentrated Ultimate Life Flask of the Surgeon')).toHaveClass('ssv-r-magic')
    expect(screen.queryByText('Ultimate Life Flask')).toBeNull()
  })
})
