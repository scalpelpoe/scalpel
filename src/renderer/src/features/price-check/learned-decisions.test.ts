import { describe, it, expect } from 'vitest'
import type { StatFilter } from './types'
import { applyLearnedDecisions } from './learned-decisions'

function f(overrides: Partial<StatFilter>): StatFilter {
  return {
    id: 'explicit.stat_x',
    text: 'test mod',
    value: 10,
    min: 10,
    max: null,
    enabled: true,
    type: 'explicit',
    ...overrides,
  }
}

describe('applyLearnedDecisions', () => {
  it('enables and marks learned when decision (true) differs from a disabled chip', () => {
    const input = [f({ id: 'explicit.stat_life', enabled: false })]
    const decisions: Record<string, boolean> = { 'explicit.stat_life': true }
    const result = applyLearnedDecisions(input, decisions)
    expect(result[0].enabled).toBe(true)
    expect(result[0].learned).toBe(true)
  })

  it('disables and marks learned when decision (false) differs from an enabled chip', () => {
    const input = [f({ id: 'explicit.stat_dex', enabled: true })]
    const decisions: Record<string, boolean> = { 'explicit.stat_dex': false }
    const result = applyLearnedDecisions(input, decisions)
    expect(result[0].enabled).toBe(false)
    expect(result[0].learned).toBe(true)
  })

  it('leaves a chip untouched (no learned flag) when the decision equals current enabled', () => {
    const input = [f({ id: 'explicit.stat_str', enabled: true })]
    const decisions: Record<string, boolean> = { 'explicit.stat_str': true }
    const result = applyLearnedDecisions(input, decisions)
    expect(result[0].enabled).toBe(true)
    expect(result[0].learned).toBeUndefined()
  })

  it('ignores chips whose id is not in the decisions map', () => {
    const input = [f({ id: 'explicit.stat_life', enabled: false })]
    const decisions: Record<string, boolean> = { 'explicit.stat_other': true }
    const result = applyLearnedDecisions(input, decisions)
    expect(result[0].enabled).toBe(false)
    expect(result[0].learned).toBeUndefined()
  })
})
