import { describe, expect, it } from 'vitest'
import { parseRoute } from './routes'

describe('parseRoute', () => {
  it('maps Twitch slugs to views', () => {
    expect(parseRoute('/', '')).toEqual({ view: 'landing' })
    expect(parseRoute('/Aer0__', '')).toEqual({ view: 'page', source: { kind: 'slug', slug: 'aer0__' } })
    expect(parseRoute('/aer0__/', '')).toEqual({ view: 'page', source: { kind: 'slug', slug: 'aer0__' } })
    expect(parseRoute('/aer0__/obs', '')).toEqual({
      view: 'obs',
      source: { kind: 'slug', slug: 'aer0__' },
      layout: 'compact',
    })
    expect(parseRoute('/aer0__/obs', '?layout=full')).toMatchObject({ view: 'obs', layout: 'full' })
    expect(parseRoute('/some%20one', '')).toEqual({ view: 'page', source: { kind: 'slug', slug: 'some one' } })
  })

  it('maps profile share links', () => {
    expect(parseRoute('/p/knfwdkms5ltdt6keulldhts3ze', '')).toEqual({
      view: 'page',
      source: { kind: 'profile', profileId: 'knfwdkms5ltdt6keulldhts3ze' },
    })
    expect(parseRoute('/p/knfwdkms5ltdt6keulldhts3ze/obs', '?layout=full')).toEqual({
      view: 'obs',
      source: { kind: 'profile', profileId: 'knfwdkms5ltdt6keulldhts3ze' },
      layout: 'full',
    })
    // A channel literally named "p" still works.
    expect(parseRoute('/p', '')).toEqual({ view: 'page', source: { kind: 'slug', slug: 'p' } })
  })
})
