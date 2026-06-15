// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MacrosTab } from './MacrosTab'
import type { RuntimeSettings } from '@shared/types'

function installApi(): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getRegexPresets: vi.fn(async () => []),
    onRegexPresetsChanged: vi.fn(() => () => {}),
    pluginListRegisteredHotkeys: vi.fn(async () => []),
    onPluginHotkeysChanged: vi.fn(() => () => {}),
    listInstalledPlugins: vi.fn(async () => []),
  }
}

const baseSettings = {
  hotkey: 'F5',
  priceCheckHotkey: 'F6',
  chatCommands: [],
  appMacros: [],
} as unknown as RuntimeSettings

describe('MacrosTab built-in hotkeys', () => {
  beforeEach(() => installApi())

  it('renders the filter and price-check rows in the Scalpel Hotkeys section', () => {
    const { getByText } = render(<MacrosTab settings={baseSettings} update={vi.fn()} tryHotkey={() => true} />)
    expect(getByText('Filter hotkey')).toBeTruthy()
    expect(getByText('Price check hotkey')).toBeTruthy()
  })

  it('clearing the filter row writes settings.hotkey and the trade row writes priceCheckHotkey', () => {
    const update = vi.fn()
    const { container } = render(<MacrosTab settings={baseSettings} update={update} tryHotkey={() => true} />)
    // With appMacros empty, the only clearable recorders are the two built-in rows,
    // in DOM order: filter first, price check second.
    const clears = container.querySelectorAll('button[title="Clear hotkey"]')
    expect(clears.length).toBe(2)
    fireEvent.click(clears[0])
    expect(update).toHaveBeenCalledWith('hotkey', '')
    fireEvent.click(clears[1])
    expect(update).toHaveBeenCalledWith('priceCheckHotkey', '')
  })
})
