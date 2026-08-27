// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MacrosTab } from './MacrosTab'
import type { AppSettings, RuntimeSettings } from '@shared/types'

function installApi(): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getRegexPresets: vi.fn(async () => []),
    onRegexPresetsChanged: vi.fn(() => () => {}),
    pluginListRegisteredHotkeys: vi.fn(async () => []),
    onPluginHotkeysChanged: vi.fn(() => () => {}),
    // Radial slices bound to a plugin show that plugin's registered tab icon.
    pluginListRegisteredTabs: vi.fn(async () => []),
    listInstalledPlugins: vi.fn(async () => []),
    suspendHotkeys: vi.fn(),
    resumeHotkeys: vi.fn(),
  }
}

const baseSettings = {
  hotkey: 'F5',
  priceCheckHotkey: 'F6',
  launcherHotkey: 'Grave',
  launcherSliceMode: 'names',
  launcherStyle: 'classic',
  chatCommands: [],
  appMacros: [],
} as unknown as RuntimeSettings

function makeSettings(patch: Record<string, unknown>): RuntimeSettings {
  return { ...baseSettings, ...patch } as unknown as RuntimeSettings
}

/** Render the tab with update/updateMany that mirror SettingsPanel's real
 *  semantics - including the hazard that makes the two different: `update`
 *  spreads the settings object the tab was RENDERED with, so two update() calls
 *  in one tick clobber each other and only the last key survives. Assert on
 *  `update`/`updateMany` for call shape, on `persisted()` for what actually
 *  lands in settings. */
function renderTab(settings: RuntimeSettings, tryHotkey: () => boolean = () => true) {
  let persisted = settings
  const update = vi.fn((key: string, value: unknown) => {
    persisted = { ...settings, [key]: value } as RuntimeSettings
  })
  const updateMany = vi.fn((patch: Partial<AppSettings>) => {
    persisted = { ...settings, ...patch } as RuntimeSettings
  })
  const utils = render(<MacrosTab settings={settings} update={update} updateMany={updateMany} tryHotkey={tryHotkey} />)
  return { ...utils, update, updateMany, persisted: () => persisted }
}

/** Drive a HotkeyRecorder: click it to start listening, then fire the chord on
 *  window (the recorder's listener lives there). `host` may be the recorder box
 *  itself or any wrapper around it. */
function recordHotkeyIn(host: HTMLElement, key: string): void {
  const box = host.classList.contains('setting-box') ? host : (host.querySelector('.setting-box') as HTMLElement)
  fireEvent.click(box)
  fireEvent.keyDown(window, { key })
}

describe('MacrosTab built-in hotkeys', () => {
  beforeEach(() => installApi())

  it('renders the filter, price-check, and launcher rows in the Scalpel Hotkeys section', () => {
    const { getByText } = renderTab(baseSettings)
    expect(getByText('Filter hotkey')).toBeTruthy()
    expect(getByText('Price check hotkey')).toBeTruthy()
    expect(getByText('Tool launcher hotkey')).toBeTruthy()
    expect(getByText('Tool launcher style')).toBeTruthy()
    expect(getByText('Tool launcher labels')).toBeTruthy()
  })

  it('changing launcher style writes launcherStyle', () => {
    const { container, update } = renderTab(baseSettings)
    const select = container.querySelector('#setting-select-tool-launcher-style') as HTMLSelectElement
    expect(select).toBeTruthy()
    fireEvent.change(select, { target: { value: 'reticle' } })
    expect(update).toHaveBeenCalledWith('launcherStyle', 'reticle')
    fireEvent.change(select, { target: { value: 'minimal' } })
    expect(update).toHaveBeenCalledWith('launcherStyle', 'minimal')
  })

  it('changing launcher slice mode writes launcherSliceMode', () => {
    const { container, update } = renderTab(baseSettings)
    const select = container.querySelector('#setting-select-tool-launcher-labels') as HTMLSelectElement
    expect(select).toBeTruthy()
    fireEvent.change(select, { target: { value: 'icons' } })
    expect(update).toHaveBeenCalledWith('launcherSliceMode', 'icons')
  })

  it('clearing the built-in rows writes the matching settings keys', () => {
    const { container, update } = renderTab(baseSettings)
    const clears = container.querySelectorAll('button[title="Clear hotkey"]')
    expect(clears.length).toBe(3)
    fireEvent.click(clears[0])
    expect(update).toHaveBeenCalledWith('hotkey', '')
    fireEvent.click(clears[1])
    expect(update).toHaveBeenCalledWith('priceCheckHotkey', '')
    fireEvent.click(clears[2])
    expect(update).toHaveBeenCalledWith('launcherHotkey', '')
  })

  it('recomputes explicit scope when a command or action changes', () => {
    const settings = makeSettings({
      chatCommands: [{ hotkey: 'F7', command: '/menagerie', autoSubmit: true, scope: 'poe1' }],
      appMacros: [{ hotkey: 'F8', action: 'openDust', scope: 'poe1' }],
    })
    const { container, getByDisplayValue, update } = renderTab(settings)

    fireEvent.change(getByDisplayValue('/menagerie'), { target: { value: '/hideout' } })
    expect(update).toHaveBeenCalledWith('chatCommands', [
      { hotkey: 'F7', command: '/hideout', autoSubmit: true, scope: undefined },
    ])

    const actionSelect = [...container.querySelectorAll('select')].find((select) => select.value === 'openDust')
    expect(actionSelect).toBeTruthy()
    fireEvent.change(actionSelect as HTMLSelectElement, { target: { value: 'openRegex' } })
    expect(update).toHaveBeenCalledWith('appMacros', [
      { hotkey: 'F8', action: 'openRegex', presetId: undefined, tag: undefined, scope: undefined },
    ])
  })
})

describe('radial menu section', () => {
  beforeEach(() => installApi())

  it('renders the section and hides openRadialMenu from the generic macro list', () => {
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: { slices: [] },
    })
    const { container, getByText } = renderTab(settings)
    expect(getByText('Radial Menu')).toBeTruthy()
    // the generic Scalpel Hotkeys list must not offer an action dropdown row for it
    expect([...container.querySelectorAll('select')].some((s) => s.value === 'openRadialMenu')).toBe(false)
  })

  it('recording a hotkey creates the macro entry and seeds slices in a single write', () => {
    const settings = makeSettings({
      hotkey: 'CommandOrControl+D',
      priceCheckHotkey: 'CommandOrControl+A',
      appMacros: [],
      radialMenu: { slices: [] },
    })
    const { getByTestId, update, updateMany, persisted } = renderTab(settings)
    recordHotkeyIn(getByTestId('radial-hotkey'), 'F2')

    // One merged write. Two update() calls would each spread the same stale
    // settings, so the radialMenu write would silently drop the binding.
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    const patch = updateMany.mock.calls[0][0]
    expect(patch.appMacros).toEqual([{ action: 'openRadialMenu', hotkey: 'F2', scope: undefined }])
    expect(patch.radialMenu?.slices.length).toBeGreaterThan(0)

    // ...and both keys survive into the settings that actually get persisted.
    const after = persisted()
    expect(after.appMacros).toEqual([{ action: 'openRadialMenu', hotkey: 'F2', scope: undefined }])
    expect(after.radialMenu?.slices.length).toBeGreaterThan(0)
  })

  it('does not re-seed when slices already exist', () => {
    const settings = makeSettings({
      hotkey: 'CommandOrControl+D',
      radialMenu: { slices: [{ id: 'rs-1', icon: 'Filter', label: 'Filter Check', action: { kind: 'filter' } }] },
    })
    const { getByTestId, update, updateMany } = renderTab(settings)
    recordHotkeyIn(getByTestId('radial-hotkey'), 'F2')
    expect(updateMany).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith('appMacros', [{ action: 'openRadialMenu', hotkey: 'F2', scope: undefined }])
  })

  it('changing a slice action resets its icon and label', () => {
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: { slices: [{ id: 'rs-1', icon: 'Filter', label: 'Filter Check', action: { kind: 'filter' } }] },
    })
    const { container, update } = renderTab(settings)
    const sliceSelect = [...container.querySelectorAll('select')].find((s) => s.value === 'filter')
    expect(sliceSelect).toBeTruthy()
    fireEvent.change(sliceSelect as HTMLSelectElement, { target: { value: 'appmacro:openWiki' } })
    expect(update).toHaveBeenCalledWith('radialMenu', {
      slices: [{ id: 'rs-1', icon: 'BookOne', label: 'Open Wiki', action: { kind: 'appmacro', action: 'openWiki' } }],
    })
  })

  it('edits the menu size, and every other radialMenu write preserves it', () => {
    const slice = { id: 'rs-1', icon: 'Filter', label: 'Filter Check', action: { kind: 'filter' } }
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: { slices: [slice], scale: 0.8 },
    })
    const { container, getByTestId, update } = renderTab(settings)

    // The control shows the stored size as a percentage and writes back a
    // factor. Same range-slider primitive the price-check default percentage
    // uses, so it is one drag on the input rather than a reveal-then-type.
    const size = getByTestId('radial-scale')
    expect(size.textContent).toContain('80%')
    const input = size.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '70' } })
    expect(update).toHaveBeenCalledWith('radialMenu', { slices: [slice], scale: 0.7 })

    // radialMenu holds two fields now: a slice write must patch it, not rebuild
    // it, or reordering the ring would silently reset the user's size.
    const sliceSelect = [...container.querySelectorAll('select')].find((s) => s.value === 'filter')
    fireEvent.change(sliceSelect as HTMLSelectElement, { target: { value: 'appmacro:openWiki' } })
    expect(update).toHaveBeenLastCalledWith('radialMenu', {
      slices: [{ id: 'rs-1', icon: 'BookOne', label: 'Open Wiki', action: { kind: 'appmacro', action: 'openWiki' } }],
      scale: 0.8,
    })
  })

  it('seeding on the first binding keeps a size the user already set', () => {
    const settings = makeSettings({
      hotkey: 'CommandOrControl+D',
      appMacros: [],
      radialMenu: { slices: [], scale: 0.7 },
    })
    const { getByTestId, updateMany } = renderTab(settings)
    recordHotkeyIn(getByTestId('radial-hotkey'), 'F2')
    const patch = updateMany.mock.calls[0][0]
    expect(patch.radialMenu?.slices.length).toBeGreaterThan(0)
    expect(patch.radialMenu?.scale).toBe(0.7)
  })

  it('offers the plugin art as a picker choice, and only for plugin slices', async () => {
    const ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
    ;(window as unknown as { api: Record<string, unknown> }).api.pluginListRegisteredTabs = vi.fn(async () => [
      { pluginId: 'acme.tool', icon: ICON },
    ])
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: {
        slices: [
          { id: 'p1', icon: 'plugin-icon', label: 'Acme', action: { kind: 'appmacro', action: 'plugin:acme.tool' } },
          { id: 's2', icon: 'Filter', label: 'Filter Check', action: { kind: 'filter' } },
        ],
      },
    })
    const { container, update } = renderTab(settings)
    await act(async () => {})

    // The plugin row's trigger wears the badge; open it and the leading choice
    // is there. The built-in row's picker never gets one.
    const triggers = [...container.querySelectorAll('button.setting-box')]
    fireEvent.click(triggers[0])
    expect(document.querySelector('[data-testid="icon-picker-plugin"]')).toBeTruthy()

    // Picking a glyph writes the name; picking the plugin choice writes the
    // sentinel, which is what lets the art win again.
    fireEvent.click(document.querySelector('button[title="Diamond"]') as HTMLElement)
    expect(update).toHaveBeenLastCalledWith(
      'radialMenu',
      expect.objectContaining({
        slices: expect.arrayContaining([expect.objectContaining({ id: 'p1', icon: 'Diamond' })]),
      }),
    )

    fireEvent.click(triggers[1])
    expect(document.querySelector('[data-testid="icon-picker-plugin"]')).toBeNull()
  })

  it('the picker writes the sentinel when the plugin art is chosen', async () => {
    const ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
    ;(window as unknown as { api: Record<string, unknown> }).api.pluginListRegisteredTabs = vi.fn(async () => [
      { pluginId: 'acme.tool', icon: ICON },
    ])
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: {
        slices: [
          { id: 'p1', icon: 'Diamond', label: 'Acme', action: { kind: 'appmacro', action: 'plugin:acme.tool' } },
        ],
      },
    })
    const { container, update } = renderTab(settings)
    await act(async () => {})

    fireEvent.click(container.querySelector('button.setting-box') as HTMLElement)
    fireEvent.click(document.querySelector('[data-testid="icon-picker-plugin"]') as HTMLElement)
    expect(update).toHaveBeenLastCalledWith(
      'radialMenu',
      expect.objectContaining({
        slices: [expect.objectContaining({ id: 'p1', icon: 'plugin-icon' })],
      }),
    )
  })

  it('an overlay-only plugin gets its art from the manifest, not the tab registry', async () => {
    // No registered tab (overlay-only plugins never register one), but the
    // manifest carries an iconUrl - so the picker must still offer the art.
    ;(window as unknown as { api: Record<string, unknown> }).api.pluginListRegisteredTabs = vi.fn(async () => [])
    ;(window as unknown as { api: Record<string, unknown> }).api.listInstalledPlugins = vi.fn(async () => [
      { manifest: { id: 'acme.calc', name: 'Calc', iconUrl: 'http://x/calc.png' }, entryUrl: '' },
    ])
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: {
        slices: [
          {
            id: 'p1',
            icon: 'plugin-icon',
            label: 'Calc',
            action: { kind: 'appmacro', action: 'plugin-overlay:acme.calc' },
          },
        ],
      },
    })
    const { container } = renderTab(settings)
    await act(async () => {})

    fireEvent.click(container.querySelector('button.setting-box') as HTMLElement)
    const choice = document.querySelector('[data-testid="icon-picker-plugin"]')
    expect(choice).toBeTruthy()
    const art = choice?.querySelector('img')
    expect(art?.getAttribute('src')).toBe('http://x/calc.png')
    // Same shared badge the ring uses, so the picker preview fills its circle too.
    expect(art?.className).toContain('object-cover')
  })

  it('keeps the icon picker open while its own grid scrolls', () => {
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: { slices: [{ id: 'rs-1', icon: 'Filter', label: 'Filter Check', action: { kind: 'filter' } }] },
    })
    const { container } = renderTab(settings)
    fireEvent.click(container.querySelector('button[title="Filter"]') as HTMLElement)
    const panel = document.querySelector('[data-context-menu]')
    expect(panel).toBeTruthy()

    // The panel is fixed off a rect captured at open time, so it closes on scroll.
    // scroll doesn't bubble, so that listener is capture-phase on window - which
    // means it also sees the picker's own scrollable icon grid and must ignore it.
    fireEvent.scroll(panel?.querySelector('.grid') as HTMLElement)
    expect(document.querySelector('[data-context-menu]')).toBeTruthy()

    // ...an outside scroll still closes it.
    fireEvent.scroll(container)
    expect(document.querySelector('[data-context-menu]')).toBeNull()
  })

  it('keeps an unresolved action selected instead of silently showing another one', () => {
    // A plugin-backed slice before pluginListRegisteredHotkeys resolves (or after
    // the plugin is uninstalled): without an orphan option the select would
    // display "Filter hotkey" and rewrite the action on the next change event.
    const settings = makeSettings({
      appMacros: [{ action: 'openRadialMenu', hotkey: 'F2' }],
      radialMenu: {
        slices: [
          {
            id: 'rs-1',
            icon: 'Components',
            label: 'Well Tiers',
            action: { kind: 'appmacro', action: 'plugin:well-tiers' },
          },
        ],
      },
    })
    const { container } = renderTab(settings)
    const sliceSelect = [...container.querySelectorAll('select')].find((s) => s.value === 'appmacro:plugin:well-tiers')
    expect(sliceSelect).toBeTruthy()
    expect(sliceSelect?.selectedOptions[0]?.textContent).toBe('Well Tiers (not loaded)')
  })
})
