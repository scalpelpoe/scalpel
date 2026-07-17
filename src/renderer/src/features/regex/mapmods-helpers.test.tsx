// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePersistedJSON } from './mapmods-helpers'

interface Payload {
  a: number
}

describe('usePersistedJSON across a storage-key change (in-process game switch)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('test:k1', JSON.stringify({ a: 1 }))
    localStorage.setItem('test:k2', JSON.stringify({ a: 2 }))
  })

  it('re-reads the new key instead of carrying the old state forward', () => {
    const { result, rerender } = renderHook(({ k }) => usePersistedJSON<Payload>(k, { a: 0 }), {
      initialProps: { k: 'test:k1' },
    })
    expect(result.current[0]).toEqual({ a: 1 })
    rerender({ k: 'test:k2' })
    expect(result.current[0]).toEqual({ a: 2 })
  })

  it('never writes the old key state under the new key', () => {
    const { rerender } = renderHook(({ k }) => usePersistedJSON<Payload>(k, { a: 0 }), {
      initialProps: { k: 'test:k1' },
    })
    rerender({ k: 'test:k2' })
    expect(JSON.parse(localStorage.getItem('test:k2') ?? '')).toEqual({ a: 2 })
    expect(JSON.parse(localStorage.getItem('test:k1') ?? '')).toEqual({ a: 1 })
  })

  it('applies the validator to loaded values, including after a key change', () => {
    localStorage.setItem('test:k3', JSON.stringify({ wrong: 'shape' }))
    const validate = (parsed: unknown): Payload => {
      const raw = parsed as { a?: unknown }
      return { a: typeof raw.a === 'number' ? raw.a : -1 }
    }
    const { result, rerender } = renderHook(({ k }) => usePersistedJSON<Payload>(k, { a: 0 }, validate), {
      initialProps: { k: 'test:k1' },
    })
    expect(result.current[0]).toEqual({ a: 1 })
    rerender({ k: 'test:k3' })
    expect(result.current[0]).toEqual({ a: -1 })
  })
})
