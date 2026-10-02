// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { resolveCssVars } from '@shared/theme/derive'
import { PRESETS_BY_ID } from '@shared/theme/presets'
import { describe, expect, it } from 'vitest'
import { themeOf, ViewerRoot } from './ViewerRoot'
import { sampleSnapshot } from '../test-helpers'

const varsOf = (el: HTMLElement): Record<string, string> =>
  Object.fromEntries([...el.style].map((k) => [k, el.style.getPropertyValue(k)]))

describe('ViewerRoot', () => {
  it("applies the snapshot palette's derived vars", () => {
    const palette = PRESETS_BY_ID.steam2026.palette
    const { container } = render(<ViewerRoot theme={palette} />)
    const expected = resolveCssVars(palette) as Record<string, string>
    const root = container.firstElementChild as HTMLElement
    for (const key of Object.keys(expected)) expect(root.style.getPropertyValue(key)).toBe(String(expected[key]))
  })

  it('defaults to poe2 when the snapshot has no theme', () => {
    const { container } = render(<ViewerRoot theme={undefined} />)
    const expected = resolveCssVars(PRESETS_BY_ID.poe2.palette) as Record<string, string>
    const root = container.firstElementChild as HTMLElement
    for (const key of Object.keys(expected)) expect(root.style.getPropertyValue(key)).toBe(String(expected[key]))
    expect(varsOf(root)).not.toEqual({})
  })

  it('leaves :root alone', () => {
    render(<ViewerRoot theme={PRESETS_BY_ID.steam2026.palette} />)
    expect(document.documentElement.getAttribute('style') ?? '').toBe('')
  })

  it('themeOf reads the theme only from a ready state', () => {
    const snapshot = sampleSnapshot()
    snapshot.theme = PRESETS_BY_ID.mono.palette
    const head = { profileId: 'p', version: 1, publishedUtc: snapshot.publishedUtc, state: 'live' as const, displayName: null }
    expect(themeOf({ status: 'ready', head, snapshot })).toEqual(PRESETS_BY_ID.mono.palette)
    expect(themeOf({ status: 'loading' })).toBeUndefined()
    expect(themeOf({ status: 'not-set-up' })).toBeUndefined()
  })
})
