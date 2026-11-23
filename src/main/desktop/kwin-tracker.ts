import type { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Message, sessionBus } from '@jellybrick/dbus-next'
import { FocusArbiter, type LayerTracker, type TrackerEvent } from 'electron-overlay-window'
import { z } from 'zod'
import { GAME_TITLES } from '@shared/contracts/game-variant'

const KWIN = 'org.kde.KWin'
const SCRIPTING = 'org.kde.kwin.Scripting'
const CALLBACK = 'com.filterscalpel.KWinTracker'
const CALLBACK_PATH = '/com/filterscalpel/KWinTracker'
// Fixed, as Scalpel runs single-instance: a script a crashed run left loaded
// in KWin is found and unloaded by name on the next start.
const SCRIPT_NAME = 'scalpel-wayland'
const POINTER_INTERVAL_MS = 40
const RECONNECT_MS = 5000

const windowState = z.object({
  id: z.string(),
  title: z.string(),
  fullscreen: z.boolean(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
})
const snapshot = z.object({
  windows: z.array(windowState),
  active: z.string().nullable(),
  pointer: z.object({ x: z.number(), y: z.number() }).nullable(),
})
type Snapshot = z.infer<typeof snapshot>
type GameWindow = z.infer<typeof windowState>

function script(destination: string): string {
  return `
const titles = ${JSON.stringify(Object.values(GAME_TITLES))};
const known = {};
let lastPointerUpdate = 0;

function publish() {
  const activeWindow = workspace.activeWindow;
  const active = activeWindow ? String(activeWindow.internalId) : null;
  const windows = [];
  for (const win of workspace.windowList()) {
    const id = String(win.internalId);
    const title = known[id] || (titles.includes(win.caption) ? win.caption : null);
    if (!title || win.minimized) continue;
    known[id] = title;
    const g = win.clientGeometry;
    if (g.width > 0 && g.height > 0) {
      windows.push({
        id, title, fullscreen: win.fullScreen,
        x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height),
      });
    }
  }
  const pos = windows.some(win => win.id === active) ? workspace.cursorPos : null;
  const pointer = pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null;
  callDBus(${JSON.stringify(destination)}, '${CALLBACK_PATH}', '${CALLBACK}', 'Update',
    JSON.stringify({ windows, active, pointer }));
}

function watch(win) {
  win.captionChanged.connect(() => {
    if (known[String(win.internalId)] || titles.includes(win.caption)) publish();
  });
  const changed = () => {
    if (known[String(win.internalId)]) publish();
  };
  win.frameGeometryChanged.connect(changed);
  win.fullScreenChanged.connect(changed);
  win.minimizedChanged.connect(changed);
}
for (const win of workspace.windowList()) watch(win);
workspace.windowAdded.connect(win => { watch(win); publish(); });
workspace.windowRemoved.connect(win => {
  delete known[String(win.internalId)];
  publish();
});
workspace.windowActivated.connect(publish);
function publishPointer() {
  lastPointerUpdate = Date.now();
  publish();
}
// Throttled with a trailing update, so the position where the pointer comes
// to rest is always published.
const pointerTimer = new QTimer();
pointerTimer.singleShot = true;
pointerTimer.timeout.connect(publishPointer);
workspace.cursorPosChanged.connect(() => {
  const active = workspace.activeWindow;
  if (!active || !known[String(active.internalId)] || pointerTimer.active) return;
  const wait = ${POINTER_INTERVAL_MS} - (Date.now() - lastPointerUpdate);
  if (wait <= 0) {
    publishPointer();
    return;
  }
  pointerTimer.interval = wait;
  pointerTimer.start();
});
publish();
`
}

function unloadScript(): Message {
  return new Message({
    destination: KWIN,
    path: '/Scripting',
    interface: SCRIPTING,
    member: 'unloadScript',
    signature: 's',
    body: [SCRIPT_NAME],
  })
}

export class KWinTracker implements LayerTracker {
  private readonly arbiter: FocusArbiter
  private bus!: ReturnType<typeof sessionBus>
  private ready: Promise<void> = Promise.resolve()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private loaded = false
  private attached: GameWindow | null = null
  private latest: Snapshot | null = null

  constructor(
    private titles: string[],
    private readonly emit: (event: TrackerEvent) => void,
  ) {
    this.arbiter = new FocusArbiter(emit)
    this.connect()
  }

  private connect(): void {
    const bus = sessionBus()
    this.bus = bus
    this.loaded = false
    const busEvents: EventEmitter = bus
    busEvents.on('error', (error: Error) => {
      if (bus !== this.bus) return
      this.latest = null
      this.detach()
      console.warn('[kwin] Tracking connection failed:', error)
      this.scheduleReconnect()
    })
    this.ready = this.start(bus).catch((error) => {
      if (!this.stopped) console.warn('[kwin] Could not start tracking:', error)
    })
  }

  /** A lost session bus connection would otherwise end tracking until restart. */
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    try {
      this.bus.disconnect()
    } catch {}
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) this.connect()
    }, RECONNECT_MS)
  }

  private async start(bus: ReturnType<typeof sessionBus>): Promise<void> {
    const owner = await bus.call(
      new Message({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'GetNameOwner',
        signature: 's',
        body: [KWIN],
      }),
    )
    if (this.stopped) return
    const sender = owner?.body[0]
    const destination = bus.name
    if (typeof sender !== 'string' || !destination) throw new Error('KWin session service unavailable')

    bus.addMethodHandler((message) => {
      if (
        message.sender !== sender ||
        message.path !== CALLBACK_PATH ||
        message.interface !== CALLBACK ||
        message.member !== 'Update' ||
        message.signature !== 's'
      )
        return false

      bus.send(Message.newMethodReturn(message))
      if (!this.stopped && bus === this.bus) {
        let value: unknown
        try {
          value = JSON.parse(String(message.body[0]))
        } catch {
          return true
        }
        const parsed = snapshot.safeParse(value)
        if (parsed.success) {
          this.latest = parsed.data
          this.update()
        }
      }
      return true
    })

    // Left by a crashed run, or by this run before a reconnect.
    await bus.call(unloadScript())
    if (this.stopped) return

    const dir = mkdtempSync(join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), 'scalpel-kwin-'))
    try {
      const file = join(dir, 'tracker.js')
      writeFileSync(file, script(destination), { mode: 0o600 })
      const reply = await bus.call(
        new Message({
          destination: KWIN,
          path: '/Scripting',
          interface: SCRIPTING,
          member: 'loadScript',
          signature: 'ss',
          body: [file, SCRIPT_NAME],
        }),
      )
      const id = reply?.body[0]
      if (typeof id !== 'number' || id < 0) throw new Error('KWin rejected the window tracker')
      this.loaded = true
      if (this.stopped) return
      await bus.call(
        new Message({
          destination: KWIN,
          path: `/Scripting/Script${id}`,
          interface: 'org.kde.kwin.Script',
          member: 'run',
        }),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  setTitles(titles: string[]): void {
    this.detach()
    this.titles = titles
    this.update()
  }

  clear(): void {
    this.setTitles([])
  }

  focusTarget(): void {
    // The overlay host releases its layer keyboard before this callback. KWin
    // then restores the previous toplevel without taking focus from other apps.
  }

  gameHasKeyboardFocus(): boolean {
    return this.attached !== null && this.latest?.active === this.attached.id
  }

  pointer(): Electron.Point | null {
    return this.gameHasKeyboardFocus() ? (this.latest?.pointer ?? null) : null
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.arbiter.stop()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    void this.ready.finally(() => {
      if (this.loaded) this.bus.send(unloadScript())
      this.bus.disconnect()
    })
  }

  private detach(): void {
    if (!this.attached) return
    if (this.arbiter.isActive) this.emit({ type: 'blur' })
    this.arbiter.reset(false)
    this.attached = null
    this.emit({ type: 'detach' })
  }

  private update(): void {
    if (!this.latest) return
    const { windows, active } = this.latest
    const focused = windows.find((win) => win.id === active && this.titles.includes(win.title))
    if (focused && focused.id !== this.attached?.id) {
      this.detach()
      this.attached = focused
      this.arbiter.reset(true)
      const { x, y, width, height } = focused
      this.emit({
        type: 'attach',
        x,
        y,
        width,
        height,
        titleIndex: this.titles.indexOf(focused.title),
        isFullscreen: focused.fullscreen,
        hasAccess: undefined,
      })
      this.emit({ type: 'focus' })
      return
    }
    const current = this.attached
    const target = windows.find((win) => win.id === current?.id)
    if (!current || !target) {
      this.detach()
      return
    }
    this.attached = target
    const { x, y, width, height } = target
    if (x !== current.x || y !== current.y || width !== current.width || height !== current.height) {
      this.emit({ type: 'moveresize', x, y, width, height })
    }
    if (target.fullscreen !== current.fullscreen) {
      this.emit({ type: 'fullscreen', isFullscreen: target.fullscreen })
    }
    this.arbiter.setGameFocused(active === target.id)
  }
}
