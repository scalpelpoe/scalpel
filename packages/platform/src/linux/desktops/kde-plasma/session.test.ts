import { describe, expect, it } from 'vitest'
import { parseKWinPointer, parseKWinSnapshot } from './session'

const window = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'w1',
  caption: 'Path of Exile',
  fullscreen: true,
  x: 0,
  y: 0,
  width: 2560,
  height: 1440,
  resourceClass: 'pathofexilesteam.exe',
  resourceName: 'wine64-preloader',
  desktopFileName: 'pathofexilesteam.exe',
  ...overrides,
})

describe('parseKWinSnapshot', () => {
  it('accepts the scripting bridge payload', () => {
    expect(parseKWinSnapshot({ windows: [window()], active: 'w1', pointer: { x: 10, y: 20 } })).toEqual({
      windows: [
        {
          id: 'w1',
          caption: 'Path of Exile',
          fullscreen: true,
          x: 0,
          y: 0,
          width: 2560,
          height: 1440,
          resourceClass: 'pathofexilesteam.exe',
          resourceName: 'wine64-preloader',
          desktopFileName: 'pathofexilesteam.exe',
        },
      ],
      active: 'w1',
      pointer: { x: 10, y: 20 },
    })
  })

  it('drops malformed windows instead of the whole snapshot', () => {
    const snapshot = parseKWinSnapshot({
      windows: [window(), { id: 5 }, window({ id: 'w2', width: 0 })],
      active: 'w1',
      pointer: null,
    })
    expect(snapshot?.windows.map((entry) => entry.id)).toEqual(['w1'])
    expect(snapshot?.pointer).toBeNull()
  })

  it('rejects payloads without a window list', () => {
    expect(parseKWinSnapshot(null)).toBeNull()
    expect(parseKWinSnapshot({})).toBeNull()
    expect(parseKWinSnapshot({ windows: 'nope' })).toBeNull()
  })

  it('treats unknown pointer coordinates as no pointer', () => {
    const snapshot = parseKWinSnapshot({ windows: [], active: null, pointer: { x: 'a', y: 1 } })
    expect(snapshot?.pointer).toBeNull()
    expect(snapshot?.active).toBeNull()
  })

  it('parses lightweight pointer updates', () => {
    expect(parseKWinPointer({ x: 10.4, y: -2.6 })).toEqual({ x: 10.4, y: -2.6 })
    expect(parseKWinPointer({ x: 10, y: 'nope' })).toBeNull()
    expect(parseKWinPointer(null)).toBeNull()
  })

  it('keeps an unknown active id rather than inventing a window', () => {
    const snapshot = parseKWinSnapshot({ windows: [window()], active: 'missing', pointer: null })
    expect(snapshot?.active).toBe('missing')
    expect(snapshot?.windows).toHaveLength(1)
  })
})
