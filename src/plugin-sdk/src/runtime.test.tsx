// @vitest-environment jsdom

import { describe, it, expect, expectTypeOf, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import * as SDK from './index'

describe('SDK runtime exports', () => {
  it('forwards pure item helpers', () => {
    expect(typeof SDK.isClusterJewel).toBe('function')
    expect(typeof SDK.isSkillGem).toBe('function')
    expect(typeof SDK.defaultPoeItem).toBe('function')
    expect(SDK.SKILL_GEM_CLASSES).toBeInstanceOf(Set)
  })

  it('forwards external link builders', () => {
    expect(typeof SDK.externalLinkUrl).toBe('function')
    expect(typeof SDK.ninjaLinkUrl).toBe('function')
    expect(typeof SDK.deriveItemVariant).toBe('function')
    expect(typeof SDK.ninjaLeagueSegment).toBe('function')
  })

  it('forwards game-feature helpers', () => {
    expect(typeof SDK.getGameFeatures).toBe('function')
    const f = SDK.getGameFeatures(1)
    expectTypeOf(f.dustExplorer).toEqualTypeOf<boolean>()
  })

  it('forwards version helpers', () => {
    expect(SDK.compareVersions('1.2.3', '1.2.0')).toBeGreaterThan(0)
    expect(SDK.versionMatches('>=1.0.0', '1.0.5')).toBe(true)
  })

  it('forwards area helpers', () => {
    expect(typeof SDK.isTownOrHideout).toBe('function')
  })

  it('forwards formatting helpers', () => {
    expect(SDK.formatPrice(1500)).toBe('1.5k')
    expect(SDK.formatDust(2_500_000)).toBe('2.5m')
  })

  it('forwards trend helpers', () => {
    expect(SDK.getTrendDirection([0, 0, 50])).toBe('up')
    expect(SDK.getTrendDirection([])).toBe('flat')
    expect(typeof SDK.TREND_UP_COLOR).toBe('string')
    expect(typeof SDK.TREND_DOWN_COLOR).toBe('string')
    expect(typeof SDK.TREND_THRESHOLD_PCT).toBe('number')
  })

  it('forwards RARITY_COLORS', () => {
    expect(SDK.RARITY_COLORS).toBeDefined()
    expect(SDK.RARITY_COLORS.Normal).toBe('#c8c8c8')
    expect(SDK.RARITY_COLORS.Unique).toBe('#af6025')
  })

  it('forwards getDustInfo', () => {
    expect(typeof SDK.getDustInfo).toBe('function')
    const nonUnique = { rarity: 'Rare', name: 'x', baseType: 'y' } as unknown as Parameters<typeof SDK.getDustInfo>[0]
    expect(SDK.getDustInfo(nonUnique)).toBeNull()
  })

  it('forwards findRelated', () => {
    expect(typeof SDK.findRelated).toBe('function')
    expect(SDK.findRelated('definitely-not-a-real-item-name-xyz')).toBeNull()
  })

  it('exports useCurrentZone as a function (hook)', () => {
    expect(typeof SDK.useCurrentZone).toBe('function')
  })

  it('renders Toggle and fires onChange on click', () => {
    const onChange = vi.fn()
    const { container } = render(<SDK.Toggle checked={false} onChange={onChange} />)
    const toggle = container.firstChild as HTMLElement
    expect(toggle).toBeTruthy()
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('renders Notice with title and body', () => {
    const { getByText } = render(<SDK.Notice icon="!" title="Test title" body="Test body" />)
    expect(getByText('Test title')).toBeTruthy()
    expect(getByText('Test body')).toBeTruthy()
  })

  it('renders ErrorBanner when a message is provided', () => {
    const { container, rerender } = render(<SDK.ErrorBanner message={null} tone="error" />)
    // null message: outer div is present but collapsed (maxHeight 0, opacity 0)
    const outer = container.firstChild as HTMLElement
    expect(outer).toBeTruthy()
    expect((outer as HTMLElement).style.maxHeight).toBe('0px')
    rerender(<SDK.ErrorBanner message="boom" tone="error" />)
    expect(container.textContent).toContain('boom')
  })
})
