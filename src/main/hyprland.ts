import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { app, type BrowserWindow, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import {
  type HyprClient,
  MIN_HYPRLAND,
  hyprlandOverlayBounds,
  hyprlandVersionAtLeast,
  isHyprlandGameContext,
} from './hyprland-policy'
import { hyprlandFocusScript } from './hyprland-focus'

const isHyprland = process.platform === 'linux' && !!process.env.HYPRLAND_INSTANCE_SIGNATURE
const exec = promisify(execFile)
let game: HyprClient | null = null
let tracking = false
let overlayActive: boolean | null = null

/** Whether to drive the compositor instead of the native X11 tracker. Resolved
 *  once, on first use: the version query costs a subprocess, and Hyprland can't
 *  be swapped underneath a running process. */
export function hyprlandOverlayActive(): boolean {
  if (!isHyprland) return false
  if (overlayActive === null) {
    try {
      overlayActive = hyprlandVersionAtLeast(
        execFileSync('hyprctl', ['-j', 'version'], { encoding: 'utf8', timeout: 1000 }),
      )
      if (!overlayActive) console.warn(`[hyprland] older than ${MIN_HYPRLAND.join('.')}; using the X11 overlay tracker`)
    } catch (error) {
      overlayActive = false
      console.warn('[hyprland] version query failed; using the X11 overlay tracker:', String(error))
    }
  }
  return overlayActive
}

// Native X11 focus can remain stale when focus moves to a Wayland client.
// Recheck with the compositor at the point of input/focus dispatch; fail closed.
// Off the Hyprland path `tracking` is never set, so this stays a no-op.
export function hyprlandInputAllowed(): boolean {
  if (!tracking) return true
  try {
    const active = JSON.parse(execFileSync('hyprctl', ['-j', 'activewindow'], { encoding: 'utf8', timeout: 500 }))
    return isHyprlandGameContext(active, game, process.pid)
  } catch {
    return false
  }
}

export function nameHyprlandOverlay(win: BrowserWindow): void {
  if (!hyprlandOverlayActive()) return
  win.setTitle('Scalpel Overlay')
  win.on('page-title-updated', (event, title) => {
    event.preventDefault()
    win.setTitle(`Scalpel Overlay: ${title}`)
  })
}

/** Hyprland owns workspace, focus and logical geometry. Avoid the native X11
 * override-redirect window and direct xcb_set_input_focus entirely here. */
export function attachHyprlandOverlay(win: BrowserWindow, initialTitles: string[]): void {
  tracking = true
  let titles = initialTitles
  let lastAddress = ''
  let overlayAddress = ''
  let focusRequestedUntil = 0
  let focusConfirmedSince = 0
  let lastGeometry = ''
  let lastFocused = false
  let lastContextActive = false
  let stopped = false
  let busy = false
  let dirty = false
  let eventsConnected = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const dispatch = async (expression: string) => {
    const result = await exec('hyprctl', ['dispatch', expression], { timeout: 1000 })
    if (result.stdout.startsWith('error:')) throw new Error(result.stdout)
  }
  OverlayController.activateOverlay = () => {
    if (!hyprlandInputAllowed() || win.isDestroyed()) return
    focusRequestedUntil = Date.now() + 1500
    focusConfirmedSince = 0
    win.setIgnoreMouseEvents(false)
    if (timer) clearTimeout(timer)
    if (busy) dirty = true
    else timer = setTimeout(poll, 0)
  }
  OverlayController.focusTarget = () => {
    focusRequestedUntil = 0
    focusConfirmedSince = 0
    if (!hyprlandInputAllowed() || !game) return
    if (!/^0x[0-9a-f]+$/i.test(game.address)) return
    try {
      execFileSync('hyprctl', ['eval', hyprlandFocusScript(game.address, game.address, process.pid)], {
        timeout: 1000,
      })
      win.setIgnoreMouseEvents(true)
    } catch (error) {
      console.warn('[hyprland] game focus handoff failed:', String(error))
    }
  }
  OverlayController.setTargetTitles = (next) => {
    titles = next
  }
  OverlayController.clearTarget = () => {
    titles = []
  }

  const poll = async () => {
    if (stopped || busy || win.isDestroyed()) return
    busy = true
    try {
      const [clientResult, activeResult, monitorResult] = await Promise.all([
        exec('hyprctl', ['-j', 'clients'], { timeout: 1000 }),
        exec('hyprctl', ['-j', 'activewindow'], { timeout: 1000 }),
        exec('hyprctl', ['-j', 'monitors'], { timeout: 1000 }),
      ])
      if (stopped || win.isDestroyed()) return
      const clients: HyprClient[] = JSON.parse(clientResult.stdout)
      overlayAddress = clients.find((c) => c.pid === process.pid && c.title === win.getTitle())?.address ?? ''
      const active: HyprClient = JSON.parse(activeResult.stdout)
      game =
        clients.find((c) => c.address === active.address && titles.includes(c.title)) ??
        clients.find((c) => c.address === lastAddress && titles.includes(c.title)) ??
        clients.find((c) => titles.includes(c.title)) ??
        null
      if (!game) {
        if (lastAddress) OverlayController.events.emit('detach')
        lastAddress = ''
        lastGeometry = ''
      } else {
        const monitors: Array<{ id: number; name: string; x: number; y: number; scale: number }> = JSON.parse(
          monitorResult.stdout,
        )
        const monitor = monitors.find((m) => m.id === game?.monitor)
        if (!monitor) throw new Error('Game monitor is unavailable')
        const display =
          screen.getAllDisplays().find((d) => d.label === monitor.name) ??
          screen.getDisplayNearestPoint({ x: monitor.x, y: monitor.y })
        const { dip: bounds, physical } = hyprlandOverlayBounds(game, monitor, display)
        const geometry = JSON.stringify(bounds)
        if (game.address !== lastAddress) {
          OverlayController.events.emit('attach', { ...physical, titleIndex: titles.indexOf(game.title) })
        } else if (geometry !== lastGeometry) {
          OverlayController.events.emit('moveresize', physical)
        }
        lastAddress = game.address

        // Move only our gameplay overlays, never Scalpel's settings window or
        // the game itself. Silent moves must not switch the user's workspace.
        for (const overlay of clients.filter((c) => c.pid === process.pid && c.title.startsWith('Scalpel Overlay'))) {
          if (!/^0x[0-9a-f]+$/i.test(overlay.address)) continue
          if (!overlay.floating)
            await dispatch(`hl.dsp.window.float({ window = "address:${overlay.address}", action = "set" })`)
          if (overlay.workspace.id !== game.workspace.id) {
            if (!Number.isInteger(game.workspace.id)) continue
            await dispatch(
              `hl.dsp.window.move({ window = "address:${overlay.address}", workspace = "${game.workspace.id}", follow = false })`,
            )
          }
        }
        if (!win.isDestroyed() && geometry !== lastGeometry) win.setBounds(bounds)
        lastGeometry = geometry
      }
      const contextActive = isHyprlandGameContext(active, game, process.pid)
      const focused = !!game && active.address === game.address
      if (focused !== lastFocused || OverlayController.targetHasFocus !== focused) {
        OverlayController.events.emit(focused ? 'focus' : 'blur')
      } else if (lastContextActive && !contextActive) {
        // Leaving a focused overlay must hide it too, even though the game
        // had already lost focus when the pointer entered that overlay.
        OverlayController.events.emit('blur')
      }
      lastFocused = focused
      lastContextActive = contextActive
      if (!contextActive) focusRequestedUntil = 0
      if (active.address === overlayAddress && win.isFocused()) {
        focusConfirmedSince ||= Date.now()
        if (Date.now() - focusConfirmedSince >= 100) focusRequestedUntil = 0
      } else focusConfirmedSince = 0
      if (focusRequestedUntil > Date.now() && overlayAddress && game && win.isVisible()) {
        // Never trust Electron's cached X11 focus. Resolve the compositor window
        // after mapping/workspace placement and check context again inside Lua.
        execFileSync('hyprctl', ['eval', hyprlandFocusScript(overlayAddress, game.address, process.pid)], {
          timeout: 1000,
        })
      }
    } catch (error) {
      game = null
      if (lastContextActive || lastFocused || OverlayController.targetHasFocus) OverlayController.events.emit('blur')
      lastFocused = false
      lastContextActive = false
      console.warn('[hyprland] overlay tracking failed:', String(error))
    } finally {
      busy = false
      if (!stopped)
        timer = setTimeout(poll, dirty || focusRequestedUntil > Date.now() ? 25 : eventsConnected ? 2000 : 250)
      dirty = false
    }
  }
  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    socket.destroy()
    game = null
  }
  win.once('closed', stop)
  app.once('before-quit', stop)
  // React promptly to workspace/focus changes without spawning compositor
  // queries continuously during gameplay. Periodic refresh covers geometry
  // changes for which the event socket doesn't provide coordinates.
  const socket = createConnection(
    join(
      process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.()}`,
      'hypr',
      process.env.HYPRLAND_INSTANCE_SIGNATURE!,
      '.socket2.sock',
    ),
  )
  socket.on('connect', () => {
    eventsConnected = true
  })
  socket.on('error', () => {
    eventsConnected = false
  })
  socket.on('close', () => {
    eventsConnected = false
  })
  socket.on('data', (data) => {
    if (
      !/(activewindow|workspace|movewindow|openwindow|closewindow|monitor|fullscreen|windowtitle|changefloatingmode|configreloaded)/.test(
        data.toString(),
      )
    )
      return
    if (busy) {
      dirty = true
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(poll, 25)
  })
  void poll()
}
