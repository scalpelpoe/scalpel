// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
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

  it('renders Button and fires onClick', () => {
    const onClick = vi.fn()
    const { getByText } = render(<SDK.Button onClick={onClick}>Hello</SDK.Button>)
    fireEvent.click(getByText('Hello'))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders TextInput with current value', () => {
    const { getByPlaceholderText } = render(<SDK.TextInput value="abc" onChange={() => {}} placeholder="ph" />)
    expect((getByPlaceholderText('ph') as HTMLInputElement).value).toBe('abc')
  })

  it('renders Label with children', () => {
    const { getByText } = render(<SDK.Label>My label</SDK.Label>)
    expect(getByText('My label')).toBeTruthy()
  })

  it('exposes Slider, Textarea, ScrubInput, RemoveButton, ExternalLinkButton', () => {
    expect(typeof SDK.Slider).toBe('function')
    expect(typeof SDK.Textarea).toBe('function')
    expect(typeof SDK.ScrubInput).toBe('function')
    expect(typeof SDK.RemoveButton).toBe('function')
    expect(typeof SDK.ExternalLinkButton).toBe('function')
  })

  it('exposes InfoChip', () => {
    expect(typeof SDK.InfoChip).toBe('function')
  })

  it('exposes LeagueDropdown, SettingSelectBox, SettingToggleBox', () => {
    expect(typeof SDK.LeagueDropdown).toBe('function')
    expect(typeof SDK.SettingSelectBox).toBe('function')
    expect(typeof SDK.SettingToggleBox).toBe('function')
  })

  it('exposes HotkeyRecorder, HotkeyField, keyEventToAccelerator, prettyHotkey', () => {
    expect(typeof SDK.HotkeyRecorder).toBe('function')
    expect(typeof SDK.HotkeyField).toBe('function')
    expect(typeof SDK.keyEventToAccelerator).toBe('function')
    expect(typeof SDK.prettyHotkey).toBe('function')
  })

  it('exposes ItemChip and getItemIcon', () => {
    expect(typeof SDK.ItemChip).toBe('function')
    expect(typeof SDK.getItemIcon).toBe('function')
  })

  it('getItemIcon returns null when globalThis.__scalpel is not set', () => {
    // No globalThis setup in jsdom; getItemIcon falls back to {} iconMap.
    const item = {
      name: 'NonExistent',
      baseType: 'NonExistent',
      itemClass: 'Maps',
      rarity: 'Normal',
    } as Parameters<typeof SDK.getItemIcon>[0]
    expect(SDK.getItemIcon(item)).toBeNull()
  })
})
