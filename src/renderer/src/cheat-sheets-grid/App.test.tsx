// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Zone } from '@shared/types'
import { App } from './App'

function setInnerHeight(height: number): void {
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

describe('cheat-sheets-grid App thumbnail homing (#465)', () => {
  let zoneHandler: ((zone: Zone | null) => void) | undefined
  let scrollIntoViewMock: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock as unknown as typeof Element.prototype.scrollIntoView
    zoneHandler = undefined

    ;(window as unknown as { api: Record<string, unknown> }).api = {
      getSettings: vi.fn(async () => ({
        poeVersion: 1,
        activeProfile: {
          cheatSheets: {
            globalHotkey: '',
            pinned: false,
            categories: [
              {
                id: 'cat1',
                name: 'Maps',
                hotkey: '',
                sheets: [{ id: 's1', ext: 'png', areaCodes: ['1_1_1'] }],
              },
            ],
          },
        },
      })),
      onSettingUpdated: vi.fn(() => () => {}),
      onCheatSheetFocusCategory: vi.fn(() => () => {}),
      onZoneChanged: vi.fn((cb: (zone: Zone | null) => void) => {
        zoneHandler = cb
        return () => {}
      }),
      closeCheatSheets: vi.fn(),
      minimizeCheatSheets: vi.fn(),
      restoreCheatSheets: vi.fn(),
      showCheatSheetPreview: vi.fn(),
      hideCheatSheetPreview: vi.fn(),
      setProfileSettingForGame: vi.fn(),
      openSettingsTab: vi.fn(),
    }
  })

  it('scrolls the current-zone thumbnail into view while the window is expanded', async () => {
    setInnerHeight(400)
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())

    act(() => {
      zoneHandler?.({ areaLevel: 5, areaCode: '1_1_1' })
    })

    expect(scrollIntoViewMock).toHaveBeenCalled()
  })

  it('does not scroll while the window is minimized', async () => {
    setInnerHeight(34)
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())

    act(() => {
      zoneHandler?.({ areaLevel: 5, areaCode: '1_1_1' })
    })

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('re-homes the current-zone thumbnail once the window is restored', async () => {
    setInnerHeight(34)
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())

    act(() => {
      zoneHandler?.({ areaLevel: 5, areaCode: '1_1_1' })
    })
    expect(scrollIntoViewMock).not.toHaveBeenCalled()

    act(() => {
      setInnerHeight(400)
      window.dispatchEvent(new Event('resize'))
    })

    expect(scrollIntoViewMock).toHaveBeenCalled()
  })
})
