import { Message, Variant, sessionBus, type ClientInterface, type MessageBus } from 'dbus-next'
import { reportBreadcrumb, reportDiagnostic } from '../../../common/diagnostics'
import type { GlobalShortcuts } from '../../../types'

/** freedesktop GlobalShortcuts portal client.
 *
 * Always runs a full session lifecycle (CreateSession -> ListShortcuts ->
 * BindShortcuts) instead of trusting restored credentials alone. Unsandboxed
 * callers use the portal's Registry interface to associate the D-Bus connection
 * with the desktop id matching the Electron appId.
 */

type Response = { code: number; results: Record<string, { value: unknown }> }
type Shortcut = [string, Record<string, Variant<string>>]

const PORTAL_NAME = 'org.freedesktop.portal.Desktop'
const PORTAL_PATH = '/org/freedesktop/portal/desktop'
const REQUEST_IFACE = 'org.freedesktop.portal.Request'
const SHORTCUTS_IFACE = 'org.freedesktop.portal.GlobalShortcuts'
const SESSION_IFACE = 'org.freedesktop.portal.Session'
const REGISTRY_IFACE = 'org.freedesktop.host.portal.Registry'
// Must match the Electron appId and an installed desktop file basename. The
// portal resolves the caller's app ID through GAppInfo; 'scalpel' is only a
// StartupWMClass and is not a valid desktop ID here.
const APP_ID = 'com.filterscalpel.app'
const REQUEST_TIMEOUT_MS = 8000

const MODIFIER = /^(CommandOrControl|Control|Ctrl|Command|Shift|Alt|Option)\+/
const KEY_NAMES: Record<string, string> = {
  Comma: 'comma',
  ',': 'comma',
  Period: 'period',
  '.': 'period',
  Space: 'space',
  Escape: 'Escape',
  Home: 'Home',
  End: 'End',
  PageUp: 'Prior',
  PageDown: 'Next',
  Insert: 'Insert',
  Delete: 'Delete',
  Left: 'Left',
  Up: 'Up',
  Right: 'Right',
  Down: 'Down',
}

/** Electron accelerator -> xkbcommon keysym spelling used by the portal. */
export function acceleratorToTrigger(accelerator: string): string {
  const parts: string[] = []
  let rest = accelerator.replace(/\s+/g, '')
  let match = rest.match(MODIFIER)
  while (match) {
    parts.push(match[1] === 'Shift' ? 'SHIFT' : match[1] === 'Alt' || match[1] === 'Option' ? 'ALT' : 'CTRL')
    rest = rest.slice(match[0].length)
    match = rest.match(MODIFIER)
  }
  const key = /^[A-Z]$/.test(rest)
    ? rest.toLowerCase()
    : /^(?:[0-9]|F(?:[1-9]|1[0-2]))$/.test(rest)
      ? rest
      : (KEY_NAMES[rest] ?? '')
  // An unmapped key is left for the compositor to configure in its own UI.
  return key ? [...parts, key].join('+') : ''
}

/** Set when a portal instance proves unusable, so the settings view can show
 *  a truthful notice instead of advertising a backend that cannot bind. */
let portalUnavailableReason: string | null = null

export function portalShortcutsUnavailable(): boolean {
  return portalUnavailableReason !== null
}

/** The accelerator itself is the portal shortcut ID: stable, unique per app,
 *  and readable in the compositor's shortcut list. */
export function createPortalShortcuts(): GlobalShortcuts {
  const callbacks = new Map<string, () => void>()
  // Portal bindings are expensive to approve and are kept across the app's
  // suspend/rearm cycles. `callbacks` is the dispatch gate; `bound` is the
  // accelerator set the compositor has (or is about to have) approved. While
  // suspended (no callbacks) `bound` keeps the approved set; the next sync
  // after a re-arm trims it to what is registered again.
  const bound = new Set<string>()
  const waiters = new Map<string, (response: Response) => void>()
  const pending = new Map<string, Response>()

  let bus: MessageBus | null = null
  let shortcuts: ClientInterface | null = null
  let sessionPath: string | null = null
  let signature: string | null = null
  let identityRegistered = false
  let tokenCounter = 0
  let chain: Promise<void> = Promise.resolve()
  let syncScheduled = false
  let unavailableReason: string | null = null

  const token = (tag: string): string => `scalpel${Date.now()}${tokenCounter++}${tag}`

  function onMessage(message: { interface?: string; member?: string; path?: string; body?: unknown[] }): void {
    if (!message.interface || !message.body) return
    if (message.interface === REQUEST_IFACE && message.member === 'Response') {
      const response: Response = {
        code: message.body[0] as number,
        results: (message.body[1] ?? {}) as Response['results'],
      }
      const path = message.path
      const waiter = path ? waiters.get(path) : undefined
      if (waiter && path) {
        waiters.delete(path)
        waiter(response)
      } else if (path) {
        pending.set(path, response)
      }
      return
    }
    if (message.interface === SHORTCUTS_IFACE && message.member === 'Activated') {
      const signalSession = message.body[0] as string
      const accelerator = (message.body[1] as string) ?? ''
      const sessionMatches = !sessionPath || signalSession === sessionPath
      const callback = callbacks.get(accelerator)
      // Log before any filter: a silent drop here is indistinguishable from a
      // shortcut never reaching the app in the diagnostics log.
      reportBreadcrumb(
        `portal shortcut activated accelerator="${accelerator}" sessionMatch=${sessionMatches} callback=${!!callback}`,
      )
      // A rebind keeps the old session live until the replacement is approved;
      // only activations from the currently active session may dispatch.
      if (!sessionMatches || !callback) return
      try {
        callback()
      } catch (error) {
        reportDiagnostic('portal-shortcuts:activated', error)
      }
    }
  }

  function addMatch(connection: MessageBus, rule: string): Promise<unknown> {
    return connection.call(
      new Message({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'AddMatch',
        signature: 's',
        body: [rule],
      }),
    )
  }

  function isMissingInterface(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('interface not found in proxy object') && message.includes(SHORTCUTS_IFACE)
  }

  async function connect(): Promise<void> {
    if (bus || unavailableReason) return
    const connection = sessionBus()
    try {
      connection.on('message', onMessage)
      connection.on('error', (error: unknown) => reportDiagnostic('portal-shortcuts:bus', error))
      // Only the portal may answer requests or activate shortcuts; another
      // client on the session bus could otherwise fake either signal.
      await Promise.all([
        addMatch(connection, `type='signal',sender='${PORTAL_NAME}',interface='${REQUEST_IFACE}',member='Response'`),
        addMatch(connection, `type='signal',sender='${PORTAL_NAME}',interface='${SHORTCUTS_IFACE}',member='Activated'`),
      ])
      const portal = await connection.getProxyObject(PORTAL_NAME, PORTAL_PATH)
      shortcuts = portal.getInterface(SHORTCUTS_IFACE)
      bus = connection
    } catch (error) {
      connection.disconnect()
      if (isMissingInterface(error)) {
        unavailableReason = 'GlobalShortcuts portal unavailable'
        portalUnavailableReason = unavailableReason
        reportBreadcrumb(`portal shortcuts unavailable: ${unavailableReason}`)
        return
      }
      throw error
    }
  }

  /** Non-interactive portal calls keep a short timeout. BindShortcuts must wait
   *  for the user's compositor approval/rejection for as long as it takes. */
  function waitForResponse(handle: string, waitForUser = false): Promise<Response> {
    const cached = pending.get(handle)
    if (cached) {
      pending.delete(handle)
      return Promise.resolve(cached)
    }
    return new Promise((resolve) => {
      const timer = waitForUser
        ? undefined
        : setTimeout(() => {
            if (waiters.delete(handle)) resolve({ code: -1, results: {} })
          }, REQUEST_TIMEOUT_MS)
      waiters.set(handle, (response) => {
        if (timer) clearTimeout(timer)
        resolve(response)
      })
    })
  }

  const handleOptions = (tag: string) => ({ handle_token: new Variant('s', token(tag)) })

  async function closeSession(path: string): Promise<void> {
    if (!bus) return
    try {
      const proxy = await bus.getProxyObject(PORTAL_NAME, path)
      await proxy.getInterface(SESSION_IFACE).Close()
    } catch (error) {
      // Best effort: the compositor may have already dropped the session.
      reportDiagnostic('portal-shortcuts:close', error)
    }
  }

  async function createSession(): Promise<string | null> {
    await connect()
    if (unavailableReason) return null
    if (!bus || !shortcuts) throw new Error('Portal shortcuts interface unavailable')

    if (!identityRegistered) {
      try {
        const portal = await bus.getProxyObject(PORTAL_NAME, PORTAL_PATH)
        await portal.getInterface(REGISTRY_IFACE).Register(APP_ID, {})
      } catch (error) {
        // Older portals do not expose the host Registry interface, but a failed
        // registration must be visible: every later portal call then reports the
        // misleading "An app id is required".
        reportDiagnostic('portal-shortcuts:register', error)
        reportBreadcrumb(`portal shortcuts app id registration failed: ${String(error)}`)
      }
      identityRegistered = true
    }

    let path: string | null = null
    try {
      const handleToken = token('session')
      const handle = (await shortcuts.CreateSession({
        handle_token: new Variant('s', handleToken),
        session_handle_token: new Variant('s', `${handleToken}session`),
      })) as string
      const created = await waitForResponse(handle)
      if (created.code !== 0 || !created.results.session_handle) {
        throw new Error(`CreateSession failed (code=${created.code})`)
      }
      path = created.results.session_handle.value as string

      const listHandle = (await shortcuts.ListShortcuts(path, handleOptions('list'))) as string
      const listed = await waitForResponse(listHandle)
      if (listed.code !== 0) throw new Error(`ListShortcuts failed (code=${listed.code})`)
      return path
    } catch (error) {
      if (path) await closeSession(path)
      throw error
    }
  }

  function desired(): { signature: string; shortcuts: Shortcut[] } {
    if (callbacks.size > 0) for (const accelerator of bound) if (!callbacks.has(accelerator)) bound.delete(accelerator)
    const accelerators = [...bound].sort()
    return {
      signature: accelerators.join('\0'),
      shortcuts: accelerators.map((accelerator) => {
        const props: Record<string, Variant<string>> = {
          description: new Variant('s', `scalpel shortcut: ${accelerator}`),
        }
        const trigger = acceleratorToTrigger(accelerator)
        if (trigger) props.preferred_trigger = new Variant('s', trigger)
        return [accelerator, props]
      }),
    }
  }

  async function bindSession(path: string, shortcutsToBind: Shortcut[]): Promise<void> {
    if (!shortcuts) throw new Error('Portal shortcuts interface unavailable')
    reportBreadcrumb(`portal shortcuts awaiting approval count=${shortcutsToBind.length}`)
    const handle = (await shortcuts.BindShortcuts(path, shortcutsToBind, '', handleOptions('bind'))) as string
    const response = await waitForResponse(handle, true)
    reportBreadcrumb(`portal shortcuts bound count=${shortcutsToBind.length} code=${response.code}`)
    if (response.code !== 0) throw new Error(`BindShortcuts failed (code=${response.code})`)
  }

  async function sync(): Promise<void> {
    if (unavailableReason) return
    const next = desired()
    if (!sessionPath) {
      if (next.shortcuts.length === 0) return
      const path = await createSession()
      if (unavailableReason || !path) return
      try {
        await bindSession(path, next.shortcuts)
      } catch (error) {
        await closeSession(path)
        throw error
      }
      sessionPath = path
      signature = next.signature
      return
    }

    // Replacing a callback without changing accelerators needs no D-Bus work.
    if (signature === next.signature) return

    if (next.shortcuts.length === 0) {
      const old = sessionPath
      sessionPath = null
      signature = null
      if (old) await closeSession(old)
      return
    }

    // A portal session may only be bound once: bind the replacement before
    // closing the old one so a failed rebind leaves live shortcuts untouched.
    const old = sessionPath
    const path = await createSession()
    if (unavailableReason || !path) return
    try {
      await bindSession(path, next.shortcuts)
    } catch (error) {
      await closeSession(path)
      throw error
    }
    sessionPath = path
    signature = next.signature
    if (old) await closeSession(old)
  }

  function scheduleSync(): void {
    if (syncScheduled) return
    syncScheduled = true
    chain = chain.then(async () => {
      syncScheduled = false
      try {
        await sync()
      } catch (error) {
        if (isMissingInterface(error)) {
          unavailableReason = 'GlobalShortcuts portal unavailable'
          portalUnavailableReason = unavailableReason
          reportBreadcrumb(`portal shortcuts unavailable: ${unavailableReason}`)
          return
        }
        // A compositor can advertise the interface but reject BindShortcuts
        // (e.g. Niri 26.04). Treat that as unavailable instead of retrying on
        // every hotkey refresh; standalone evdev/electron fallbacks stay live.
        if (String(error).startsWith('BindShortcuts failed')) {
          unavailableReason = 'GlobalShortcuts portal cannot bind on this compositor'
          portalUnavailableReason = unavailableReason
          reportBreadcrumb(`portal shortcuts unavailable: ${unavailableReason}`)
          return
        }
        reportDiagnostic('portal-shortcuts:sync', error)
        reportBreadcrumb(`portal shortcuts sync failed: ${String(error)}`)
      }
    })
  }

  return {
    register(accelerator, callback) {
      if (unavailableReason) return false
      if (callbacks.has(accelerator)) return false
      callbacks.set(accelerator, callback)
      if (!bound.has(accelerator)) {
        bound.add(accelerator)
        scheduleSync()
      }
      return true
    },
    unregister(accelerator) {
      if (!callbacks.delete(accelerator)) return
      bound.delete(accelerator)
      scheduleSync()
    },
    unregisterAll() {
      // Drop dispatch but keep the portal session: approval is expensive, and
      // a suspend/re-arm cycle usually registers the same accelerators again.
      callbacks.clear()
    },
    isRegistered(accelerator) {
      return callbacks.has(accelerator)
    },
  }
}
