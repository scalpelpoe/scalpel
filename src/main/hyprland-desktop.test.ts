import { EventEmitter } from 'node:events'
import type { BrowserWindow, Rectangle } from 'electron'
import type { HyprClient } from './hyprland-policy'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  exec: vi.fn(),
  sync: vi.fn(),
  socket: null as unknown as EventEmitter & { destroy: () => void },
  controller: null as unknown as { events: EventEmitter; targetHasFocus: boolean; targetBounds: Rectangle | null },
  active: null as HyprClient | null,
  clients: [] as HyprClient[],
}))
vi.mock('node:child_process', () => ({ execFile: vi.fn(), execFileSync: mock.sync }))
vi.mock('node:util', () => ({ promisify: () => mock.exec }))
vi.mock('node:net', () => ({ createConnection: () => mock.socket }))
vi.mock('electron-overlay-window', () => ({
  get OverlayController() {
    return mock.controller
  },
}))
vi.mock('electron', () => ({
  app: { once: vi.fn() },
  screen: {
    getAllDisplays: () => [{ label: 'DP-2', bounds: { x: -1920, y: 0 }, scaleFactor: 2 }],
  },
}))
const game: HyprClient = {
  address: '0x1',
  pid: 999,
  title: 'Path of Exile 2',
  at: [-2400, 0],
  size: [2400, 1350],
  workspace: { id: 2 },
  monitor: 0,
  floating: true,
}
const panel = { ...game, address: '0x2', pid: process.pid, title: 'Scalpel Overlay: Radial' }
let backend: typeof import('./hyprland')
let main: BrowserWindow
let secondary: BrowserWindow
const evals = () => mock.sync.mock.calls.filter(([, args]) => args[0] === 'eval').map(([, args]) => args[1])
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', 'test')
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  mock.socket = Object.assign(new EventEmitter(), { destroy: vi.fn() })
  mock.controller = { events: new EventEmitter(), targetHasFocus: true, targetBounds: null }
  mock.controller.events.on('attach', (bounds: Rectangle) => {
    mock.controller.targetBounds = bounds
  })
  mock.active = game
  mock.clients = [game]
  const query = (name: string) =>
    JSON.stringify(
      name === 'clients'
        ? mock.clients
        : name === 'activewindow'
          ? mock.active
          : name === 'cursorpos'
            ? { x: -1800, y: 675 }
            : [{ id: 0, name: 'DP-2', x: -2400, y: 0, scale: 1.6 }],
    )
  mock.exec.mockImplementation(async (_cmd, args) => ({ stdout: args[0] === '-j' ? query(args[1]) : 'ok' }))
  mock.sync.mockImplementation((_cmd, args) => (args[0] === '-j' ? query(args[1]) : 'ok'))
  const window = (title: string) =>
    Object.assign(new EventEmitter(), {
      getTitle: () => title,
      isDestroyed: () => false,
      isVisible: () => true,
      isFocused: () => false,
      setIgnoreMouseEvents: vi.fn(),
      setBounds: vi.fn(),
    })
  main = window('Scalpel Overlay') as unknown as BrowserWindow
  secondary = window(panel.title) as unknown as BrowserWindow
  backend = await import('./hyprland')
  backend.attachHyprlandOverlay(main, [game.title])
  await vi.advanceTimersByTimeAsync(0)
})
afterEach(() => {
  main.emit('closed')
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it('retries a secondary dialog focus request until its compositor window exists', async () => {
  backend.focusHyprlandPanel(secondary)
  await vi.advanceTimersByTimeAsync(30)
  expect(evals()).toEqual([])
  mock.clients.push(panel)
  await vi.advanceTimersByTimeAsync(30)
  expect(evals().some((script) => script.includes('address:0x2'))).toBe(true)
})
it('cancels pending focus when the user changes apps', async () => {
  backend.focusHyprlandPanel(secondary)
  mock.clients.push(panel)
  mock.active = { ...game, address: '0x3', pid: 300, title: 'Other app' }
  await vi.advanceTimersByTimeAsync(100)
  expect(evals()).toEqual([])
})
it('does not focus a dialog that was closed while mapping', async () => {
  backend.focusHyprlandPanel(secondary)
  mock.clients.push(panel)
  secondary.isVisible = () => false
  await vi.advanceTimersByTimeAsync(100)
  expect(evals()).toEqual([])
})
it('maps the pointer into Electron DIP and restores it to the original compositor point', () => {
  expect(backend.getHyprlandCursorDip()).toEqual({ x: -1440, y: 540 })
  backend.warpHyprlandCursor({ x: -1440, y: 540 })
  expect(evals()[0]).toContain('x = -1800, y = 675')
  expect(evals()[0]).toContain('active.address ~= "0x1"')
})
it('refuses cursor restoration outside the game context', () => {
  mock.active = { ...game, address: '0x3', pid: 300, title: 'Other app' }
  backend.warpHyprlandCursor({ x: -1440, y: 540 })
  expect(evals()).toEqual([])
})

const geometryCalls = () => mock.exec.mock.calls.filter(([, args]) => args[0] === 'eval')
const mainClient = () => ({ ...game, address: '0x4', pid: process.pid, title: main.getTitle() })

it('corrects a mapped overlay that is one pixel short without another Electron resize', async () => {
  mock.clients.push({ ...mainClient(), size: [2399, 1349] })
  vi.mocked(main.setBounds).mockClear()
  await vi.advanceTimersByTimeAsync(250)
  expect(geometryCalls()).toHaveLength(1)
  expect(geometryCalls()[0][1][1]).toContain('address:0x4')
  expect(main.setBounds).not.toHaveBeenCalled()
  mock.clients[1] = mainClient()
  await vi.advanceTimersByTimeAsync(1000)
  expect(geometryCalls()).toHaveLength(1)
})

it('corrects position independently of size, including a nonzero monitor origin', async () => {
  mock.clients.push({ ...mainClient(), at: [-2399, 22] })
  await vi.advanceTimersByTimeAsync(250)
  expect(geometryCalls()).toHaveLength(1)
})

it('does not resize correctly aligned overlays or secondary panels', async () => {
  mock.clients.push(mainClient(), { ...panel, at: [100, 100], size: [800, 600] })
  await vi.advanceTimersByTimeAsync(1000)
  expect(geometryCalls()).toHaveLength(0)
})

it('bounds retries when geometry cannot converge, and retries after a remap', async () => {
  const overlay = { ...mainClient(), size: [2399, 1349] as [number, number] }
  mock.clients.push(overlay)
  await vi.advanceTimersByTimeAsync(3000)
  expect(geometryCalls()).toHaveLength(4)
  mock.clients = [game]
  await vi.advanceTimersByTimeAsync(250)
  mock.clients.push(overlay)
  await vi.advanceTimersByTimeAsync(1000)
  expect(geometryCalls()).toHaveLength(8)
})

it('retries a new game geometry after a previous correction exhausted its budget', async () => {
  mock.clients.push({ ...mainClient(), size: [2399, 1349] })
  await vi.advanceTimersByTimeAsync(3000)
  expect(geometryCalls()).toHaveLength(4)
  mock.active = { ...game, at: [0, 1440], size: [5120, 2160] }
  mock.clients[0] = mock.active
  await vi.advanceTimersByTimeAsync(1000)
  expect(geometryCalls()).toHaveLength(8)
})

it('uses an idempotent float request when an overlay is observed tiled', async () => {
  mock.clients.push({ ...panel, floating: false })
  await vi.advanceTimersByTimeAsync(250)
  expect(mock.exec).toHaveBeenCalledWith(
    'hyprctl',
    ['dispatch', 'hl.dsp.window.float({ window = "address:0x2", action = "on" })'],
    { timeout: 1000 },
  )
})
