import { describe, it, expect } from 'vitest'

describe('scalpel-internal URL parsing', () => {
  it('extracts the module name from scalpel-internal://sdk.js', () => {
    const url = new URL('scalpel-internal://sdk.js')
    const name = url.hostname + (url.pathname === '/' ? '' : url.pathname.replace(/^\//, ''))
    expect(name).toBe('sdk.js')
  })

  it('extracts the module name from scalpel-internal://react.js', () => {
    const url = new URL('scalpel-internal://react.js')
    const name = url.hostname + (url.pathname === '/' ? '' : url.pathname.replace(/^\//, ''))
    expect(name).toBe('react.js')
  })
})
