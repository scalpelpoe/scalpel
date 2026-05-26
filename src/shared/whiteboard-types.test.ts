import { describe, it, expect } from 'vitest'
import {
  emptyBoardLibrary,
  validateBoardLibrary,
  CURRENT_SCHEMA_VERSION,
  ELEMENT_VALIDATORS,
  ELEMENT_TYPES,
} from './whiteboard-types'

describe('emptyBoardLibrary', () => {
  it('returns an empty library at the current schema version', () => {
    const lib = emptyBoardLibrary({ w: 1920, h: 1080 })
    expect(lib.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(lib.active.elements).toEqual([])
    expect(lib.active.authoredAtGameSize).toEqual({ w: 1920, h: 1080 })
    expect(lib.snapshots).toEqual([])
  })
})

describe('validateBoardLibrary', () => {
  it('accepts a freshly-emptied library', () => {
    expect(validateBoardLibrary(emptyBoardLibrary({ w: 1920, h: 1080 }))).toBe(true)
  })

  it('rejects null and non-objects', () => {
    expect(validateBoardLibrary(null)).toBe(false)
    expect(validateBoardLibrary('hello')).toBe(false)
    expect(validateBoardLibrary(42)).toBe(false)
  })

  it('rejects mismatched schemaVersion', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 }) as unknown as Record<string, unknown>
    lib.schemaVersion = 999
    expect(validateBoardLibrary(lib)).toBe(false)
  })

  it('rejects when active is missing', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 }) as unknown as Record<string, unknown>
    delete lib.active
    expect(validateBoardLibrary(lib)).toBe(false)
  })

  it('rejects when an element has an unknown type', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({ id: 'a', z: 0, rotation: 0, type: 'mystery' } as never)
    expect(validateBoardLibrary(lib)).toBe(false)
  })

  it('rejects when a snapshot contains an invalid element', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.snapshots.push({
      id: 's1',
      name: 'bad',
      createdAt: 0,
      state: {
        schemaVersion: 1,
        elements: [{ id: 'x', z: 0, rotation: 0, type: 'mystery' } as never],
        authoredAtGameSize: { w: 1, h: 1 },
      },
    })
    expect(validateBoardLibrary(lib)).toBe(false)
  })

  it('rejects when an element has a non-boolean locked field', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({
      id: 'a',
      z: 0,
      rotation: 0,
      type: 'stroke',
      variant: 'pen',
      points: [],
      color: '#000',
      width: 0.001,
      locked: 'yes' as unknown as boolean,
    })
    expect(validateBoardLibrary(lib)).toBe(false)
  })

  it('accepts a stroke element with valid points', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({
      id: 'a',
      z: 0,
      rotation: 0,
      type: 'stroke',
      variant: 'pen',
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      color: '#ff0000',
      width: 0.005,
    })
    expect(validateBoardLibrary(lib)).toBe(true)
  })

  it('accepts each shape variant', () => {
    const variants = ['rect', 'ellipse', 'arrow', 'line', 'triangle'] as const
    for (const shape of variants) {
      const lib = emptyBoardLibrary({ w: 1, h: 1 })
      lib.active.elements.push({
        id: `s-${shape}`,
        z: 0,
        rotation: 0,
        type: 'shape',
        shape,
        bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        stroke: '#ff0000',
        strokeWidth: 0.0035,
        fill: null,
      })
      expect(validateBoardLibrary(lib)).toBe(true)
    }
  })

  it('accepts a text element with valid fields', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({
      id: 't1',
      z: 0,
      rotation: 0,
      type: 'text',
      bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
      text: 'hello',
      color: '#ffffff',
      fontSize: 0.025,
      fontWeight: 600,
    })
    expect(validateBoardLibrary(lib)).toBe(true)
  })

  it('accepts an image element with a data URL src', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({
      id: 'img1',
      z: 0,
      rotation: 0,
      type: 'image',
      bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
    })
    expect(validateBoardLibrary(lib)).toBe(true)
  })

  it('rejects an image element with a non-data URL src (no external fetches)', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({
      id: 'img1',
      z: 0,
      rotation: 0,
      type: 'image',
      bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
      src: 'https://example.com/x.png',
    } as never)
    expect(validateBoardLibrary(lib)).toBe(false)
  })

  it('rejects an image element with a missing src', () => {
    const lib = emptyBoardLibrary({ w: 1, h: 1 })
    lib.active.elements.push({
      id: 'img1',
      z: 0,
      rotation: 0,
      type: 'image',
      bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
    } as never)
    expect(validateBoardLibrary(lib)).toBe(false)
  })
})

describe('ruler / radiusRing validators', () => {
  it('lists the new kinds in ELEMENT_TYPES', () => {
    expect(ELEMENT_TYPES).toContain('ruler')
    expect(ELEMENT_TYPES).toContain('radiusRing')
  })

  it('accepts a well-formed ruler', () => {
    expect(
      ELEMENT_VALIDATORS.ruler({
        a: { x: 1, y: 2 },
        b: { x: 3, y: 4 },
        stroke: '#fff',
        strokeWidth: 0.0035,
      }),
    ).toBe(true)
  })

  it('rejects a ruler with a bad point', () => {
    expect(ELEMENT_VALIDATORS.ruler({ a: { x: 1 }, b: { x: 3, y: 4 }, stroke: '#fff', strokeWidth: 0.0035 })).toBe(
      false,
    )
  })

  it('accepts a well-formed radiusRing (null and string fill)', () => {
    const base = { center: { x: 0, y: 0 }, radius: 20, stroke: '#fff', strokeWidth: 0.0035 }
    expect(ELEMENT_VALIDATORS.radiusRing({ ...base, fill: null })).toBe(true)
    expect(ELEMENT_VALIDATORS.radiusRing({ ...base, fill: '#ffffff40' })).toBe(true)
  })

  it('rejects a radiusRing with a non-number radius', () => {
    expect(
      ELEMENT_VALIDATORS.radiusRing({
        center: { x: 0, y: 0 },
        radius: 'big',
        stroke: '#fff',
        strokeWidth: 0.0035,
        fill: null,
      }),
    ).toBe(false)
  })
})
