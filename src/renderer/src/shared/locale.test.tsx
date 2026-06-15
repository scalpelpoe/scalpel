// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocale } from '@shared/paraglide/runtime.js'
import { m } from '@shared/paraglide/messages.js'
import {
  _resetLocaleForTests,
  bootstrapLocale,
  bootstrapLocaleSync,
  LOCALE_LABELS,
  LocaleProvider,
  setAppLocale,
  SUPPORTED_LOCALES,
  useCurrentLocale,
} from './locale'

const MIRROR_KEY = 'scalpel:locale'

type Api = {
  getSettings: ReturnType<typeof vi.fn>
  setSetting: ReturnType<typeof vi.fn>
  onSettingUpdated: ReturnType<typeof vi.fn>
}

function installApi(overrides: Partial<Api> = {}): Api {
  const api: Api = {
    getSettings: vi.fn(async () => ({ locale: 'en' })),
    setSetting: vi.fn(async () => {}),
    onSettingUpdated: vi.fn(() => () => {}),
    ...overrides,
  }
  ;(window as unknown as { api: Api }).api = api
  return api
}

let api: Api

beforeEach(() => {
  _resetLocaleForTests()
  // Reinstall the Paraglide get/set overrides against the freshly reset state.
  bootstrapLocaleSync()
  api = installApi()
})

describe('locale labels', () => {
  it('exposes the three compiled locales with a self-referential label each', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'es', 'de'])
    for (const code of SUPPORTED_LOCALES) {
      expect(LOCALE_LABELS[code]).toBeTruthy()
    }
  })
})

describe('setAppLocale', () => {
  it('mirrors to localStorage, persists to settings, and switches message output', () => {
    expect(m.common_change()).toBe('Change')

    setAppLocale('de')

    expect(localStorage.getItem(MIRROR_KEY)).toBe('de')
    expect(api.setSetting).toHaveBeenCalledWith('locale', 'de')
    expect(getLocale()).toBe('de')
    expect(m.common_change()).toBe('Ändern')
  })

  it('resolves messages in Spanish after switching', () => {
    setAppLocale('es')
    expect(m.common_change()).toBe('Cambiar')
  })
})

describe('bootstrapLocaleSync', () => {
  it('seeds the active locale from a valid localStorage mirror', () => {
    _resetLocaleForTests()
    localStorage.setItem(MIRROR_KEY, 'es')
    bootstrapLocaleSync()
    expect(getLocale()).toBe('es')
  })

  it('ignores an invalid mirror value and stays on the base locale', () => {
    _resetLocaleForTests()
    localStorage.setItem(MIRROR_KEY, 'xx')
    bootstrapLocaleSync()
    expect(getLocale()).toBe('en')
  })
})

describe('bootstrapLocale', () => {
  it('adopts the persisted setting without re-persisting it', async () => {
    api = installApi({ getSettings: vi.fn(async () => ({ locale: 'es' })) })
    await bootstrapLocale()
    expect(getLocale()).toBe('es')
    expect(api.setSetting).not.toHaveBeenCalled()
  })

  it('applies a cross-window change from onSettingUpdated without echoing it back', async () => {
    let handler: ((key: string, value: unknown) => void) | undefined
    api = installApi({
      onSettingUpdated: vi.fn((cb: (key: string, value: unknown) => void) => {
        handler = cb
        return () => {}
      }),
    })
    await bootstrapLocale()
    expect(getLocale()).toBe('en')

    act(() => handler?.('locale', 'de'))
    expect(getLocale()).toBe('de')
    // A broadcast-originated change must not loop back into settings.
    expect(api.setSetting).not.toHaveBeenCalled()

    // Unrelated setting changes are ignored.
    act(() => handler?.('themeId', 'custom'))
    expect(getLocale()).toBe('de')
  })

  it('is a safe no-op when the IPC bridge is unavailable', async () => {
    ;(window as unknown as { api?: Api }).api = undefined
    await expect(bootstrapLocale()).resolves.toBeUndefined()
    expect(getLocale()).toBe('en')
  })
})

describe('LocaleProvider', () => {
  it('re-renders consumers when the locale changes', () => {
    function Label(): JSX.Element {
      return <span>{LOCALE_LABELS[useCurrentLocale()]}</span>
    }
    const { getByText } = render(
      <LocaleProvider>
        <Label />
      </LocaleProvider>,
    )
    expect(getByText('English')).toBeTruthy()

    act(() => setAppLocale('de'))
    expect(getByText('Deutsch')).toBeTruthy()
  })
})
