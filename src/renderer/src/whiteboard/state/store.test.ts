import { describe, it, expect, beforeEach } from 'vitest'
import { createWhiteboardStore } from './store'
import type { StrokeElement } from '../../../../shared/whiteboard-types'

const stroke = (id: string): StrokeElement => ({
  id,
  z: 0,
  rotation: 0,
  type: 'stroke',
  variant: 'pen',
  points: [{ x: 0.1, y: 0.1 }],
  color: '#ff0000',
  width: 0.005,
})

describe('whiteboard store', () => {
  let store: ReturnType<typeof createWhiteboardStore>

  beforeEach(() => {
    store = createWhiteboardStore()
  })

  it('starts clean (no elements, select tool, dirty=false)', () => {
    const s = store.getState()
    expect(s.elements).toEqual([])
    expect(s.tool).toBe('select')
    expect(s.dirty).toBe(false)
  })

  it('addElement appends and marks dirty', () => {
    store.getState().addElement(stroke('a'))
    expect(store.getState().elements).toHaveLength(1)
    expect(store.getState().dirty).toBe(true)
  })

  it('removeElements drops by id', () => {
    store.getState().addElement(stroke('a'))
    store.getState().addElement(stroke('b'))
    store.getState().removeElements(['a'])
    expect(store.getState().elements.map((e) => e.id)).toEqual(['b'])
  })

  it('updateElement replaces in place', () => {
    store.getState().addElement(stroke('a'))
    store.getState().updateElement('a', (e) => ({ ...e, color: '#00ff00' }))
    const found = store.getState().elements.find((e) => e.id === 'a')
    expect(found && (found as StrokeElement).color).toBe('#00ff00')
  })

  it('clearAll empties and marks dirty', () => {
    store.getState().addElement(stroke('a'))
    store.getState().markClean()
    store.getState().clearAll()
    expect(store.getState().elements).toEqual([])
    expect(store.getState().dirty).toBe(true)
  })

  it('setTool changes the active tool but does not mark dirty', () => {
    store.getState().setTool('eraser')
    expect(store.getState().tool).toBe('eraser')
    expect(store.getState().dirty).toBe(false)
  })

  it('setColor and setWidth are sticky per tool variant', () => {
    store.getState().setColor('#abcdef')
    store.getState().setWidth(0.01)
    expect(store.getState().color).toBe('#abcdef')
    expect(store.getState().width).toBe(0.01)
  })

  it('replaceAll swaps the entire element list (used by snapshot loads)', () => {
    store.getState().addElement(stroke('a'))
    store.getState().replaceAll([stroke('z')])
    expect(store.getState().elements.map((e) => e.id)).toEqual(['z'])
    expect(store.getState().dirty).toBe(true)
  })

  it('setShapeVariant updates shapeVariant and does not mark dirty', () => {
    expect(store.getState().shapeVariant).toBe('rect')
    store.getState().setShapeVariant('arrow')
    expect(store.getState().shapeVariant).toBe('arrow')
    expect(store.getState().dirty).toBe(false)
  })

  it('setTextFontSize updates textFontSize and does not mark dirty', () => {
    const initial = store.getState().textFontSize
    store.getState().setTextFontSize(initial * 2)
    expect(store.getState().textFontSize).toBe(initial * 2)
    expect(store.getState().dirty).toBe(false)
  })

  it('setEditingTextId tracks one editor at a time', () => {
    expect(store.getState().editingTextId).toBeNull()
    store.getState().setEditingTextId('t1')
    expect(store.getState().editingTextId).toBe('t1')
    store.getState().setEditingTextId(null)
    expect(store.getState().editingTextId).toBeNull()
  })

  it('addElements bulk-appends with a single history snapshot', () => {
    store.getState().snapshotForHistory() // seed
    const before = store.getState().historyVersion
    store.getState().addElements([stroke('a'), stroke('b'), stroke('c')])
    expect(store.getState().elements.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(store.getState().historyVersion).toBe(before + 1)
  })

  it('addElements with empty array is a no-op', () => {
    const before = store.getState().historyVersion
    store.getState().addElements([])
    expect(store.getState().elements).toEqual([])
    expect(store.getState().historyVersion).toBe(before)
  })

  it('copyToClipboard stashes deep clones, not references', () => {
    const a = stroke('a')
    store.getState().addElement(a)
    store.getState().copyToClipboard(['a'])
    const clip = store.getState().clipboard
    expect(clip).toHaveLength(1)
    expect(clip[0].id).toBe('a')
    expect(clip[0]).not.toBe(a)
    // Mutating the source element after copy must not affect the clipboard.
    store.getState().updateElement('a', (e) => ({ ...e, color: '#00ff00' }))
    expect((clip[0] as ReturnType<typeof stroke>).color).toBe('#ff0000')
  })

  it('copyToClipboard resets pasteCount', () => {
    store.getState().addElement(stroke('a'))
    store.getState().copyToClipboard(['a'])
    store.getState().pasteFromClipboard((el) => el)
    expect(store.getState().pasteCount).toBe(1)
    store.getState().copyToClipboard(['a'])
    expect(store.getState().pasteCount).toBe(0)
  })

  it('copyToClipboard ignores ids that match nothing', () => {
    store.getState().addElement(stroke('a'))
    const before = store.getState().clipboard
    store.getState().copyToClipboard(['does-not-exist'])
    expect(store.getState().clipboard).toBe(before)
  })

  it('copyToClipboard preserves canvas z-order', () => {
    store.getState().addElement(stroke('a'))
    store.getState().addElement(stroke('b'))
    store.getState().addElement(stroke('c'))
    // Pick ids in arbitrary order; the clipboard should mirror canvas order.
    store.getState().copyToClipboard(['c', 'a'])
    expect(store.getState().clipboard.map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('pasteFromClipboard generates fresh ids and selects the pasted group', () => {
    store.getState().addElement(stroke('a'))
    store.getState().copyToClipboard(['a'])
    const newIds = store.getState().pasteFromClipboard((el) => el)
    expect(newIds).toHaveLength(1)
    expect(newIds[0]).not.toBe('a')
    expect(store.getState().elements.map((e) => e.id)).toEqual(['a', newIds[0]])
    expect(store.getState().selectedIds).toEqual(newIds)
  })

  it('pasteFromClipboard applies the translate function to each clone', () => {
    const original = stroke('a')
    store.getState().addElement(original)
    store.getState().copyToClipboard(['a'])
    const newIds = store
      .getState()
      .pasteFromClipboard((el) => (el.type === 'stroke' ? { ...el, color: '#abcdef' } : el))
    const pasted = store.getState().elements.find((e) => e.id === newIds[0])
    expect(pasted && (pasted as ReturnType<typeof stroke>).color).toBe('#abcdef')
    // The original is untouched.
    expect(store.getState().elements.find((e) => e.id === 'a')?.id).toBe('a')
  })

  it('pasteFromClipboard increments pasteCount', () => {
    store.getState().addElement(stroke('a'))
    store.getState().copyToClipboard(['a'])
    store.getState().pasteFromClipboard((el) => el)
    store.getState().pasteFromClipboard((el) => el)
    expect(store.getState().pasteCount).toBe(2)
  })

  it('pasteFromClipboard with empty clipboard is a no-op', () => {
    const before = store.getState().historyVersion
    const ids = store.getState().pasteFromClipboard((el) => el)
    expect(ids).toEqual([])
    expect(store.getState().elements).toEqual([])
    expect(store.getState().historyVersion).toBe(before)
  })

  it('pasteFromClipboard with an external source ignores the in-memory clipboard', () => {
    store.getState().addElement(stroke('on-canvas'))
    // In-memory clipboard is empty; pass an external source.
    const external = [stroke('from-outside')]
    const newIds = store.getState().pasteFromClipboard((el) => el, external)
    expect(newIds).toHaveLength(1)
    expect(store.getState().elements.map((e) => e.id)).toEqual(['on-canvas', newIds[0]])
    // Internal clipboard stays untouched.
    expect(store.getState().clipboard).toEqual([])
  })

  it('pasteFromClipboard with an empty external source is a no-op', () => {
    const before = store.getState().historyVersion
    const ids = store.getState().pasteFromClipboard((el) => el, [])
    expect(ids).toEqual([])
    expect(store.getState().historyVersion).toBe(before)
  })

  it('pasteFromClipboard collapses N pastes into a single history snapshot', () => {
    store.getState().addElement(stroke('a'))
    store.getState().addElement(stroke('b'))
    store.getState().copyToClipboard(['a', 'b'])
    const before = store.getState().historyVersion
    store.getState().pasteFromClipboard((el) => el)
    expect(store.getState().historyVersion).toBe(before + 1)
    expect(store.getState().elements).toHaveLength(4)
  })
})

describe('poeVersion + new tools', () => {
  it('defaults poeVersion to null and stores a set value', () => {
    const store = createWhiteboardStore()
    expect(store.getState().poeVersion).toBeNull()
    store.getState().setPoeVersion(1)
    expect(store.getState().poeVersion).toBe(1)
  })
  it('accepts the ruler and radiusRing tools', () => {
    const store = createWhiteboardStore()
    store.getState().setTool('ruler')
    expect(store.getState().tool).toBe('ruler')
    store.getState().setTool('radiusRing')
    expect(store.getState().tool).toBe('radiusRing')
  })
})
