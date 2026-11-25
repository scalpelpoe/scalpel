import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Message, NameFlag, RequestNameReply, sessionBus, type MessageBus } from 'dbus-next'
import { reportBreadcrumb, reportDiagnostic } from '@platform/common/diagnostics'

/**
 * KWin DBus scripting bridge.
 *
 * KWin exposes no foreign-toplevel protocol, so a small script runs inside KWin
 * and reports its window list, active window and pointer over `callDBus`. The
 * script is loaded through `org.kde.kwin.Scripting` and unloaded by a fixed
 * name (Scalpel is single-instance), so a crashed run cannot leave two copies
 * fighting over the callback.
 */

const KWIN = 'org.kde.KWin'
const SCRIPTING = 'org.kde.kwin.Scripting'
const CALLBACK = 'com.filterscalpel.KWinTracker'
const CALLBACK_PATH = '/com/filterscalpel/KWinTracker'
const SCRIPT_NAME = 'scalpel-wayland'
const SCRIPT_NAME_FILE = 'scalpel-kwin-script'
const POINTER_INTERVAL_MS = 40
const PUBLISH_INTERVAL_MS = 16
const RECONNECT_MS = 5000

export interface KWinWindow {
  readonly id: string
  readonly caption: string
  readonly fullscreen: boolean
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly resourceClass: string
  readonly resourceName: string
  readonly desktopFileName: string
}

export interface KWinSnapshot {
  readonly windows: readonly KWinWindow[]
  readonly active: string | null
  readonly pointer: KWinPointer | null
}

export interface KWinPointer {
  readonly x: number
  readonly y: number
}

export interface KWinSessionOptions {
  readonly onSnapshot: (snapshot: KWinSnapshot | null) => void
  /** Lightweight pointer updates, sent without the window list. */
  readonly onPointer?: (pointer: KWinPointer) => void
  readonly env?: NodeJS.ProcessEnv
  readonly reconnectMs?: number
  readonly scriptName?: string
  /** Injected by tests; production always uses the session bus. */
  readonly busFactory?: () => MessageBus
}

function script(): string {
  return `
let lastPointerUpdate = 0;

function windows() {
  const list = [];
  for (const win of workspace.windowList()) {
    if (win.minimized) continue;
    const g = win.clientGeometry;
    if (!g || g.width <= 0 || g.height <= 0) continue;
    list.push({
      id: String(win.internalId),
      caption: win.caption || '',
      fullscreen: win.fullScreen === true,
      x: Math.round(g.x),
      y: Math.round(g.y),
      width: Math.round(g.width),
      height: Math.round(g.height),
      resourceClass: win.resourceClass || '',
      resourceName: win.resourceName || '',
      desktopFileName: win.desktopFileName || '',
    });
  }
  return list;
}

function send(member, payload) {
  callDBus(${JSON.stringify(CALLBACK)}, ${JSON.stringify(CALLBACK_PATH)}, ${JSON.stringify(CALLBACK)}, member,
    JSON.stringify(payload));
}

function publish() {
  const list = windows();
  const activeWindow = workspace.activeWindow;
  const active = activeWindow ? String(activeWindow.internalId) : null;
  const hasActive = active !== null && list.some(win => win.id === active);
  const pos = hasActive ? workspace.cursorPos : null;
  const pointer = pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null;
  send('Update', { windows: list, active, pointer });
}

function publishPointer() {
  if (!workspace.activeWindow) return;
  const pos = workspace.cursorPos;
  send('Pointer', { x: Math.round(pos.x), y: Math.round(pos.y) });
}

// Coalesce the geometry/activation burst that opening or resizing an overlay
// produces: one snapshot per frame instead of one DBus call per signal.
const publishTimer = new QTimer();
publishTimer.singleShot = true;
publishTimer.interval = ${PUBLISH_INTERVAL_MS};
publishTimer.timeout.connect(publish);

function schedulePublish() {
  if (publishTimer.active) return;
  publishTimer.start();
}

function watch(win) {
  const changed = schedulePublish;
  win.captionChanged.connect(changed);
  win.frameGeometryChanged.connect(changed);
  win.fullScreenChanged.connect(changed);
  win.minimizedChanged.connect(changed);
}
for (const win of workspace.windowList()) watch(win);
workspace.windowAdded.connect(win => { watch(win); schedulePublish(); });
workspace.windowRemoved.connect(schedulePublish);
workspace.windowActivated.connect(schedulePublish);

// Throttled with a trailing update, so the position where the pointer comes to
// rest is always published.
const pointerTimer = new QTimer();
pointerTimer.singleShot = true;
pointerTimer.timeout.connect(() => {
  lastPointerUpdate = Date.now();
  publishPointer();
});
workspace.cursorPosChanged.connect(() => {
  if (pointerTimer.active) return;
  const wait = ${POINTER_INTERVAL_MS} - (Date.now() - lastPointerUpdate);
  if (wait <= 0) {
    lastPointerUpdate = Date.now();
    publishPointer();
    return;
  }
  pointerTimer.interval = wait;
  pointerTimer.start();
});
publish();
`
}

function unloadMessage(scriptName: string): Message {
  return new Message({
    destination: KWIN,
    path: '/Scripting',
    interface: SCRIPTING,
    member: 'unloadScript',
    signature: 's',
    body: [scriptName],
  })
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Hand-validated pointer payload. */
export function parseKWinPointer(value: unknown): KWinPointer | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const x = finiteNumber(record.x)
  const y = finiteNumber(record.y)
  return x !== null && y !== null ? { x, y } : null
}

/** Hand-validated snapshot. Unknown window entries are skipped instead of
 *  discarding the whole frame: one malformed window must not freeze tracking. */
export function parseKWinSnapshot(value: unknown): KWinSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.windows)) return null

  const windows: KWinWindow[] = []
  for (const raw of record.windows) {
    if (!raw || typeof raw !== 'object') continue
    const win = raw as Record<string, unknown>
    if (typeof win.id !== 'string' || typeof win.caption !== 'string') continue
    const x = finiteNumber(win.x)
    const y = finiteNumber(win.y)
    const width = finiteNumber(win.width)
    const height = finiteNumber(win.height)
    if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) continue
    windows.push({
      id: win.id,
      caption: win.caption,
      fullscreen: win.fullscreen === true,
      x,
      y,
      width,
      height,
      resourceClass: text(win.resourceClass),
      resourceName: text(win.resourceName),
      desktopFileName: text(win.desktopFileName),
    })
  }

  const active = typeof record.active === 'string' ? record.active : null
  const pointer = parseKWinPointer(record.pointer)

  return { windows, active, pointer }
}

export class KWinSession {
  private readonly scriptName: string
  private readonly reconnectMs: number
  private bus: MessageBus | null = null
  private ready: Promise<void> = Promise.resolve()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private scriptDir: string | null = null
  private stopped = false
  private loaded = false

  constructor(private readonly options: KWinSessionOptions) {
    // KWin caches scripts by plugin name; a per-process name guarantees the
    // newly written script text is evaluated instead of the previous one.
    this.scriptName = options.scriptName ?? `${SCRIPT_NAME}-${process.pid}`
    this.reconnectMs = options.reconnectMs ?? RECONNECT_MS
  }

  start(): void {
    if (this.stopped) return
    this.connect()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const bus = this.bus
    void this.ready.finally(async () => {
      if (bus) {
        try {
          if (this.loaded) bus.send(unloadMessage(this.scriptName))
        } catch {
          // The connection may already be gone; stopping must stay best-effort.
        }
        try {
          await bus.releaseName(CALLBACK)
        } catch {
          // Disconnecting releases the name too.
        }
        try {
          bus.disconnect()
        } catch {
          // Ignore a double disconnect.
        }
      }
      this.removeScriptDir()
      this.bus = null
      this.options.onSnapshot(null)
    })
  }

  /** KWin may evaluate a loaded script after `run` returns, so the file must
   *  outlive the DBus call. Keep it under the runtime dir until stop/reconnect. */
  private removeScriptDir(): void {
    if (!this.scriptDir) return
    try {
      rmSync(this.scriptDir, { recursive: true, force: true })
    } catch {
      // A leftover temp dir is harmless; the compositor may still hold the file.
    }
    this.scriptDir = null
  }

  private scriptNameFile(): string {
    return join(this.options.env?.XDG_RUNTIME_DIR ?? tmpdir(), SCRIPT_NAME_FILE)
  }

  /** The previous run writes its unique name here so a crash can be cleaned. */
  private previousScriptNames(): string[] {
    try {
      const previous = readFileSync(this.scriptNameFile(), 'utf8').trim()
      return previous ? [previous] : []
    } catch {
      return []
    }
  }

  private rememberScriptName(): void {
    try {
      writeFileSync(this.scriptNameFile(), this.scriptName, { mode: 0o600 })
    } catch {
      // Cleanup is best-effort; a stale script is still unloaded by its name.
    }
  }

  private connect(): void {
    if (this.stopped) return
    const bus = (this.options.busFactory ?? sessionBus)()
    this.bus = bus
    this.loaded = false
    bus.on('error', (error: Error) => {
      if (bus !== this.bus) return
      reportDiagnostic('kwin-session', error)
      this.options.onSnapshot(null)
      this.scheduleReconnect()
    })
    this.ready = this.install(bus).catch((error) => {
      if (bus !== this.bus) return
      reportDiagnostic('kwin-session', error)
      if (!this.stopped) this.scheduleReconnect()
    })
  }

  /** A lost session bus connection would otherwise end tracking until restart. */
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const bus = this.bus
    this.bus = null
    try {
      bus?.disconnect()
    } catch {
      // Already disconnected.
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) this.connect()
    }, this.reconnectMs)
  }

  private async install(bus: MessageBus): Promise<void> {
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
    if (this.stopped || bus !== this.bus) return
    const sender = owner?.body[0]
    if (typeof sender !== 'string') throw new Error('KWin session service unavailable')

    // A stable well-known name lets a script survive an app reconnect instead of
    // embedding this process's unique bus name in the script text.
    const requested = await bus.requestName(CALLBACK, NameFlag.DO_NOT_QUEUE)
    if (requested !== RequestNameReply.PRIMARY_OWNER && requested !== RequestNameReply.ALREADY_OWNER) {
      throw new Error('KWin tracker callback name is already owned')
    }
    if (this.stopped || bus !== this.bus) return

    bus.addMethodHandler((message: Message) => {
      if (
        message.sender !== sender ||
        message.path !== CALLBACK_PATH ||
        message.interface !== CALLBACK ||
        (message.member !== 'Update' && message.member !== 'Pointer') ||
        message.signature !== 's'
      ) {
        return false
      }
      try {
        bus.send(Message.newMethodReturn(message))
      } catch {
        // Quit can close the stream while KWin still has a call in flight;
        // there is no reply to deliver and the error is not actionable.
        return true
      }
      if (this.stopped || bus !== this.bus) return true
      let value: unknown
      try {
        value = JSON.parse(String(message.body[0]))
      } catch {
        return true
      }
      if (message.member === 'Pointer') {
        const pointer = parseKWinPointer(value)
        if (pointer) this.options.onPointer?.(pointer)
        return true
      }
      const snapshot = parseKWinSnapshot(value)
      if (snapshot) this.options.onSnapshot(snapshot)
      return true
    })

    // Unload this process's previous script (reconnect) plus the legacy fixed
    // name and the last crashed run's name. Loading uses a unique name because
    // KWin caches scripts by plugin name.
    const staleNames = new Set([SCRIPT_NAME, this.scriptName, ...this.previousScriptNames()])
    for (const name of staleNames) await bus.call(unloadMessage(name))
    if (this.stopped || bus !== this.bus) return
    this.rememberScriptName()
    this.removeScriptDir()

    const runtime = this.options.env?.XDG_RUNTIME_DIR ?? tmpdir()
    const dir = mkdtempSync(join(runtime, 'scalpel-kwin-'))
    this.scriptDir = dir
    const file = join(dir, 'tracker.js')
    writeFileSync(file, script(), { mode: 0o600 })
    const reply = await bus.call(
      new Message({
        destination: KWIN,
        path: '/Scripting',
        interface: SCRIPTING,
        member: 'loadScript',
        signature: 'ss',
        body: [file, this.scriptName],
      }),
    )
    const id = reply?.body[0]
    if (typeof id !== 'number' || id < 0) throw new Error('KWin rejected the window tracker')
    this.loaded = true
    if (this.stopped || bus !== this.bus) return
    // KWin registers the script object just after replying to loadScript.
    await new Promise((resolve) => setTimeout(resolve, 100))
    await bus.call(
      new Message({
        destination: KWIN,
        path: `/Scripting/Script${id}`,
        interface: 'org.kde.kwin.Script',
        member: 'run',
      }),
    )
    reportBreadcrumb(`kwin session tracker running script=${this.scriptName} id=${id}`)
  }
}
