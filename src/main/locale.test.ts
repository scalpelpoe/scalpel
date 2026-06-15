import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { getLocale } from '@shared/paraglide/runtime.js'
import { initMainLocale } from './locale'

type ChangeHandler = (value: unknown) => void

/** Minimal electron-store stand-in: serves a fixed `locale` value and lets a test
 *  drive the `onDidChange('locale')` callback via the returned `emit`. */
function makeStore(initial: unknown): { store: Store<AppSettings>; emit: (value: unknown) => void } {
  let handler: ChangeHandler | null = null
  const store = {
    get: vi.fn((key: string) => (key === 'locale' ? initial : undefined)),
    onDidChange: vi.fn((key: string, cb: ChangeHandler) => {
      if (key === 'locale') handler = cb
      return () => {}
    }),
  }
  return { store: store as unknown as Store<AppSettings>, emit: (value) => handler?.(value) }
}

describe('initMainLocale', () => {
  // initMainLocale re-seeds the module-level `current` from the store on every
  // call, but only when the stored value is a valid locale. Reset to 'en' first
  // so a case that seeds an invalid value asserts against a known baseline.
  beforeEach(() => {
    initMainLocale(makeStore('en').store)
  })

  it('seeds the locale from the store so getLocale reflects the persisted value', () => {
    initMainLocale(makeStore('de').store)
    expect(getLocale()).toBe('de')
  })

  it('falls back to en when the stored value is not a valid locale', () => {
    initMainLocale(makeStore('klingon').store)
    expect(getLocale()).toBe('en')
  })

  it('updates the locale and fires onChange when the setting changes', () => {
    const { store, emit } = makeStore('en')
    const onChange = vi.fn()
    initMainLocale(store, onChange)
    emit('es')
    expect(getLocale()).toBe('es')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores an invalid locale change and does not fire onChange', () => {
    const { store, emit } = makeStore('en')
    const onChange = vi.fn()
    initMainLocale(store, onChange)
    emit('nope')
    expect(getLocale()).toBe('en')
    expect(onChange).not.toHaveBeenCalled()
  })
})
