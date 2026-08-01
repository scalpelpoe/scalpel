// src/shared/learning.test.ts
import { describe, it, expect } from 'vitest'
import { isLearnable } from './learning'

describe('isLearnable', () => {
  it('accepts stat-mod lines and rejects others', () => {
    expect(isLearnable({ type: 'explicit' })).toBe(true)
    expect(isLearnable({ type: 'pseudo' })).toBe(true)
    expect(isLearnable({ type: 'misc' })).toBe(false)
    expect(isLearnable({ type: 'socket' })).toBe(false)
  })

  it('accepts imbued chips (real emitted type string)', () => {
    expect(isLearnable({ type: 'imbued' })).toBe(true)
    expect(isLearnable({ type: 'imbue' })).toBe(false)
  })

  it('accepts granted-skill chips (issue #478)', () => {
    expect(isLearnable({ type: 'skill' })).toBe(true)
  })
})
