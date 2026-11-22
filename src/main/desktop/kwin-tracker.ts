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
  win.captionChanged.connect(publish);
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
workspace.cursorPosChanged.connect(() => {
  const active = workspace.activeWindow;
  if (!active || !known[String(active.internalId)] || Date.now() - lastPointerUpdate < 40) return;
  lastPointerUpdate = Date.now();
  publish();
});
publish();
`
}

export class KWinTracker implements LayerTracker {
  private readonly arbiter: FocusArbiter
  private readonly bus = sessionBus()
  private readonly name = `scalpel-wayland-${process.pid}`
  private ready: Promise<void>
  private stopped = false
  private loaded = false
  private attached: GameWindow | null = null
  private latest: Snapshot | null = null

  constructor(
    private titles: string[],
    private readonly emit: (event: TrackerEvent) => void,
  ) {
    this.arbiter = new FocusArbiter(emit)
    const busEvents: EventEmitter = this.bus
    busEvents.on('error', (error: Error) => {
      this.latest = null
      this.detach()
      console.warn('[kwin] Tracking connection failed:', error)
    })
    this.ready = this.start().catch((error) => {
      if (!this.stopped) console.warn('[kwin] Could not start tracking:', error)
    })
  }

  private async start(): Promise<void> {
    const owner = await this.bus.call(
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
    const destination = this.bus.name
    if (typeof sender !== 'string' || !destination) throw new Error('KWin session service unavailable')

    this.bus.addMethodHandler((message) => {
      if (
        message.sender !== sender ||
        message.path !== CALLBACK_PATH ||
        message.interface !== CALLBACK ||
        message.member !== 'Update' ||
        message.signature !== 's'
      )
        return false

      this.bus.send(Message.newMethodReturn(message))
      if (!this.stopped) {
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

    const dir = mkdtempSync(join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), 'scalpel-kwin-'))
    try {
      const file = join(dir, 'tracker.js')
      writeFileSync(file, script(destination), { mode: 0o600 })
      const reply = await this.bus.call(
        new Message({
          destination: KWIN,
          path: '/Scripting',
          interface: SCRIPTING,
          member: 'loadScript',
          signature: 'ss',
          body: [file, this.name],
        }),
      )
      const id = reply?.body[0]
      if (typeof id !== 'number' || id < 0) throw new Error('KWin rejected the window tracker')
      this.loaded = true
      if (this.stopped) return
      await this.bus.call(
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
    void this.ready.finally(() => {
      if (this.loaded) {
        this.bus.send(
          new Message({
            destination: KWIN,
            path: '/Scripting',
            interface: SCRIPTING,
            member: 'unloadScript',
            signature: 's',
            body: [this.name],
          }),
        )
      }
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
