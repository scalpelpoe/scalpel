import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ exec: vi.fn(), game: vi.fn(), displays: vi.fn(), image: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:util', () => ({ promisify: () => mock.exec }))
vi.mock('../hyprland', () => ({ getHyprlandGame: mock.game }))
vi.mock('electron', () => ({
  nativeImage: { createFromBuffer: mock.image },
  screen: { getAllDisplays: mock.displays },
}))
import { captureHyprlandGame } from './hyprland-capture'

const game = {
  address: '0x1',
  pid: 100,
  title: 'Path of Exile 2',
  workspace: { id: 2 },
  at: [2400, 0],
  size: [2400, 1350],
  monitor: 1,
}
let active = game
beforeEach(() => {
  vi.clearAllMocks()
  active = game
  mock.game.mockReturnValue(game)
  mock.displays.mockReturnValue([{ label: 'DP-2', bounds: { x: 1920, y: 0 }, scaleFactor: 2 }])
  mock.exec.mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === 'grim') return { stdout: Buffer.from('png') }
    const value =
      args[1] === 'activewindow'
        ? active
        : args[1] === 'clients'
          ? [game]
          : [{ id: 1, name: 'DP-2', x: 2400, y: 0, scale: 1.6 }]
    return { stdout: JSON.stringify(value) }
  })
  mock.image.mockReturnValue({
    isEmpty: () => false,
    getSize: () => ({ width: 3840, height: 2160 }),
    toBitmap: () => Buffer.from('bgra'),
  })
})

describe('Hyprland game capture', () => {
  it('captures the game region without a picker, preserving physical pixels and Electron CSS scale', async () => {
    expect(await captureHyprlandGame()).toEqual({
      frame: {
        data: Buffer.from('bgra'),
        width: 3840,
        height: 2160,
        gameSize: { width: 1920, height: 1080 },
        scale: 2,
      },
    })
    expect(mock.exec).toHaveBeenCalledWith(
      'grim',
      ['-g', '2400,0 2400x1350', '-s', '1.6', '-l', '1', '-'],
      expect.objectContaining({ encoding: 'buffer', timeout: 5000 }),
    )
  })
  it('accepts an unnamed XWayland display on a single-monitor desktop', async () => {
    mock.displays.mockReturnValue([{ label: '', bounds: { x: 1920, y: 0 }, scaleFactor: 2 }])
    expect((await captureHyprlandGame()).frame).toMatchObject({ width: 3840, scale: 2 })
  })
  it('rejects stale tracker focus before starting a screenshot', async () => {
    active = { ...game, address: '0x2' }
    expect(await captureHyprlandGame()).toEqual({ frame: null, failure: 'focus' })
    expect(mock.exec).toHaveBeenCalledTimes(1)
  })
  it('discards a screenshot when the user switches apps during capture', async () => {
    const original = mock.exec.getMockImplementation()!
    mock.exec.mockImplementation(async (cmd, args) => {
      const result = await original(cmd, args)
      if (cmd === 'grim') active = { ...game, address: '0x2' }
      return result
    })
    expect(await captureHyprlandGame()).toEqual({ frame: null, failure: 'focus' })
    expect(mock.image).not.toHaveBeenCalled()
  })
  it('does not allow skipFocusGate to capture unrelated applications', async () => {
    active = { ...game, address: '0x2', pid: 200 }
    expect(await captureHyprlandGame({ skipFocusGate: true })).toEqual({ frame: null, failure: 'focus' })
  })
  it('rejects unknown monitor mappings instead of grabbing the first display', async () => {
    mock.displays.mockReturnValue([])
    expect(await captureHyprlandGame()).toEqual({ frame: null, failure: 'geometry' })
    expect(mock.exec.mock.calls.some(([cmd]) => cmd === 'grim')).toBe(false)
  })
  it('reports a missing grim without opening a portal picker', async () => {
    mock.exec.mockRejectedValue(Object.assign(new Error('missing grim'), { code: 'ENOENT' }))
    expect(await captureHyprlandGame()).toEqual({ frame: null, failure: 'error' })
  })
  it('rejects a moved game and empty images', async () => {
    const original = mock.exec.getMockImplementation()!
    mock.exec.mockImplementation(async (cmd, args) => {
      const result = await original(cmd, args)
      if (cmd === 'grim') active = { ...game, at: [2000, 0] }
      return result
    })
    expect(await captureHyprlandGame()).toEqual({ frame: null, failure: 'geometry' })
    active = game
    mock.exec.mockImplementation(original)
    mock.image.mockReturnValue({ isEmpty: () => true })
    expect(await captureHyprlandGame()).toEqual({ frame: null, failure: 'empty-frame' })
  })
})
