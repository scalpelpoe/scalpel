import { describe, expect, it } from 'vitest'
import type { FilterBlock } from '@shared/types'
import { validateBlock } from './validate'

function block(over: Partial<FilterBlock>): FilterBlock {
  return {
    id: 'x',
    visibility: 'Show',
    conditions: [],
    actions: [],
    continue: false,
    lineStart: 1,
    lineEnd: 1,
    ...over,
  }
}

describe('validateBlock', () => {
  it('passes a normal block', () => {
    const b = block({
      inlineComment: '$type->currency $tier->t1',
      conditions: [{ type: 'BaseType', operator: '==', values: ['Divine Orb'], explicitOperator: true }],
      actions: [{ type: 'SetFontSize', values: ['45'] }],
    })
    expect(validateBlock(b)).toEqual([])
  })

  it('flags a condition with no values', () => {
    const b = block({
      conditions: [{ type: 'BaseType', operator: '==', values: [], explicitOperator: true }],
    })
    expect(validateBlock(b).length).toBeGreaterThan(0)
  })

  it('passes a socket condition with color-letter values (no numeric check)', () => {
    const b = block({
      conditions: [{ type: 'Sockets', operator: '>=', values: ['6WWWWWW'], explicitOperator: true }],
    })
    expect(validateBlock(b)).toEqual([])
  })

  it('passes an abyss-socket condition (Sockets >= AAAA)', () => {
    const b = block({
      conditions: [{ type: 'Sockets', operator: '>=', values: ['AAAA'], explicitOperator: true }],
    })
    expect(validateBlock(b)).toEqual([])
  })

  it('flags a block that does not round-trip structurally', () => {
    // A condition type containing a space cannot survive serialize -> reparse:
    // "Foo Bar x" re-parses as keyword "Foo" with values ["Bar", "x"], so the
    // structural shape diverges and the round-trip check must catch it.
    const b = block({
      conditions: [{ type: 'Foo Bar', operator: '=', values: ['x'], explicitOperator: false }],
    })
    expect(validateBlock(b).length).toBeGreaterThan(0)
  })

  it('does not flag a block whose only "missing" action is a values-less (disabled) action', () => {
    const b = block({
      conditions: [{ type: 'BaseType', operator: '==', values: ['Chaos Orb'], explicitOperator: true }],
      actions: [{ type: 'PlayEffect', values: [] }],
    })
    expect(validateBlock(b)).toEqual([])
  })

  it('does not flag a value-less boolean condition (only value-list conditions count)', () => {
    const b = block({
      conditions: [{ type: 'Corrupted', operator: '=', values: [], explicitOperator: false }],
    })
    expect(validateBlock(b)).toEqual([])
  })

  it("passes a value containing '#' (serializer quotes it so it round-trips)", () => {
    const b = block({
      conditions: [{ type: 'BaseType', operator: '==', values: ['Weird#Name'], explicitOperator: true }],
    })
    expect(validateBlock(b)).toEqual([])
  })
})
