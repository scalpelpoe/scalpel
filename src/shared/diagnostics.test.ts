import { describe, expect, it } from 'vitest'
import { serializeDiagnosticError } from './diagnostics'

describe('serializeDiagnosticError', () => {
  it('serializes Error instances', () => {
    const err = new TypeError('boom')
    const result = serializeDiagnosticError(err)
    expect(result.name).toBe('TypeError')
    expect(result.message).toBe('boom')
    expect(result.stack).toContain('TypeError')
  })

  it('unwraps rejection event-like reasons', () => {
    const result = serializeDiagnosticError({ reason: new Error('async boom') })
    expect(result.message).toBe('async boom')
  })

  it('handles primitive values', () => {
    expect(serializeDiagnosticError('plain failure')).toEqual({ message: 'plain failure' })
  })

  it('handles circular non-Error objects', () => {
    const err: { self?: unknown } = {}
    err.self = err

    expect(serializeDiagnosticError(err)).toEqual({ message: '[object Object]' })
  })
})
