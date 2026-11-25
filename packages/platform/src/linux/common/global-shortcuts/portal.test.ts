import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [] as Array<{ member: string; args: unknown[] }>,
  listeners: [] as Array<(message: unknown) => void>,
  handle: 0,
}))

vi.mock('dbus-next', () => ({
  sessionBus: () => ({
    on: (event: string, listener: (message: unknown) => void) => {
      if (event === 'message') state.listeners.push(listener)
    },
    call: vi.fn(async () => null),
    getProxyObject: vi.fn(async (_name: string, path?: string) => ({
      getInterface: (name: string) => {
        if (name === 'org.freedesktop.portal.Session') {
          return { Close: () => record('Session.Close', [path]) }
        }
        if (name === 'org.freedesktop.portal.GlobalShortcuts') {
          return {
            CreateSession: (options: unknown) => request('CreateSession', [options]),
            ListShortcuts: (session: unknown, options: unknown) => request('ListShortcuts', [session, options]),
            BindShortcuts: (session: unknown, shortcuts: unknown, _group: unknown, options: unknown) =>
              request('BindShortcuts', [session, shortcuts, options]),
          }
        }
        if (name === 'org.freedesktop.host.portal.Registry') {
          return { Register: async (appId: string, options: unknown) => record('Register', [appId, options]) }
        }
        throw new Error(`unexpected portal interface: ${name}`)
      },
    })),
  }),
  Variant: class {
    constructor(
      public signature: string,
      public value: unknown,
    ) {}
  },
  Message: class {
    constructor(public options: unknown) {}
  },
}))

vi.mock('../../../common/diagnostics', () => ({ reportBreadcrumb: vi.fn(), reportDiagnostic: vi.fn() }))

import { reportBreadcrumb } from '../../../common/diagnostics'
import { acceleratorToTrigger, createPortalShortcuts } from './portal'

function record(member: string, args: unknown[]): void {
  state.calls.push({ member, args })
}

function request(member: string, args: unknown[]): Promise<string> {
  record(member, args)
  return Promise.resolve(`/request/${++state.handle}`)
}

function emit(message: Record<string, unknown>): void {
  for (const listener of state.listeners) listener(message)
}

function respond(requestNumber: number, code = 0, results: Record<string, { value: unknown }> = {}): void {
  emit({
    interface: 'org.freedesktop.portal.Request',
    member: 'Response',
    path: `/request/${requestNumber}`,
    body: [code, results],
  })
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve))
}

async function bindInitial(
  client: ReturnType<typeof createPortalShortcuts>,
  accelerator: string,
  callback: () => void = vi.fn(),
): Promise<void> {
  client.register(accelerator, callback)
  await settle()
  respond(1, 0, { session_handle: { value: '/session/one' } })
  await settle()
  respond(2)
  await settle()
  respond(3)
  await settle()
}

function callsOf(member: string) {
  return state.calls.filter((call) => call.member === member)
}

function boundIds(call: { args: unknown[] }): string[] {
  return (call.args[1] as Array<[string, unknown]>).map(([id]) => id)
}

beforeEach(() => {
  state.calls.length = 0
  state.listeners.length = 0
  state.handle = 0
  vi.mocked(reportBreadcrumb).mockClear()
})

describe('accelerator translation', () => {
  it('matches portal trigger spelling', () => {
    expect(acceleratorToTrigger('CommandOrControl+D')).toBe('CTRL+d')
    expect(acceleratorToTrigger('Ctrl+Shift+F5')).toBe('CTRL+SHIFT+F5')
    expect(acceleratorToTrigger('Alt+Space')).toBe('ALT+space')
    expect(acceleratorToTrigger('Escape')).toBe('Escape')
    expect(acceleratorToTrigger('MediaPlayPause')).toBe('')
  })
})

describe('portal shortcut client', () => {
  it('runs the full lifecycle and dispatches activations', async () => {
    const client = createPortalShortcuts()
    const trigger = vi.fn()
    client.register('CommandOrControl+D', trigger)
    await settle()

    expect(callsOf('Register')).toEqual([{ member: 'Register', args: ['com.filterscalpel.app', {}] }])
    expect(callsOf('CreateSession')).toHaveLength(1)
    respond(1, 0, { session_handle: { value: '/session/scalpel' } })
    await settle()
    expect(callsOf('ListShortcuts')).toHaveLength(1)

    respond(2)
    await settle()
    expect(callsOf('BindShortcuts')).toHaveLength(1)
    const shortcut = (callsOf('BindShortcuts')[0].args[1] as Array<[string, Record<string, { value: string }>]>)[0]
    expect(shortcut[0]).toBe('CommandOrControl+D')
    expect(shortcut[1].preferred_trigger.value).toBe('CTRL+d')

    emit({
      interface: 'org.freedesktop.portal.GlobalShortcuts',
      member: 'Activated',
      body: ['/session/scalpel', shortcut[0], 1234, {}],
    })
    expect(trigger).toHaveBeenCalledOnce()
    expect(client.isRegistered('CommandOrControl+D')).toBe(true)
  })

  it('coalesces rapid registrations into one bind', async () => {
    const client = createPortalShortcuts()
    client.register('Ctrl+D', vi.fn())
    client.register('Ctrl+A', vi.fn())
    await settle()
    respond(1, 0, { session_handle: { value: '/session/rapid' } })
    await settle()
    respond(2)
    await settle()

    expect(boundIds(callsOf('BindShortcuts')[0])).toEqual(['Ctrl+A', 'Ctrl+D'])
    respond(3)
    await settle()
  })

  it('ignores duplicate registrations', async () => {
    const client = createPortalShortcuts()
    expect(client.register('Ctrl+D', vi.fn())).toBe(true)
    expect(client.register('Ctrl+D', vi.fn())).toBe(false)
    await settle()
    expect(callsOf('CreateSession')).toHaveLength(1)
    respond(1, 0, { session_handle: { value: '/session/dupe' } })
    await settle()
    respond(2)
    await settle()
    respond(3)
    await settle()
    expect(boundIds(callsOf('BindShortcuts')[0])).toEqual(['Ctrl+D'])
  })

  it('rebinds via a fresh session and ignores the old session', async () => {
    const client = createPortalShortcuts()
    const trigger = vi.fn()
    await bindInitial(client, 'Ctrl+D')
    const escape = vi.fn()
    client.register('Escape', escape)
    await settle()

    expect(callsOf('CreateSession')).toHaveLength(2)
    respond(4, 0, { session_handle: { value: '/session/two' } })
    await settle()
    respond(5)
    await settle()
    expect(callsOf('Session.Close')).toHaveLength(0)

    respond(6)
    await settle()
    expect(callsOf('Session.Close')).toEqual([{ member: 'Session.Close', args: ['/session/one'] }])

    emit({
      interface: 'org.freedesktop.portal.GlobalShortcuts',
      member: 'Activated',
      body: ['/session/one', 'Escape', 1234, {}],
    })
    expect(escape).not.toHaveBeenCalled()
    emit({
      interface: 'org.freedesktop.portal.GlobalShortcuts',
      member: 'Activated',
      body: ['/session/two', 'Escape', 1234, {}],
    })
    expect(escape).toHaveBeenCalledOnce()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('closes the session when the last shortcut is removed', async () => {
    const client = createPortalShortcuts()
    await bindInitial(client, 'Ctrl+D')
    client.unregister('Ctrl+D')
    await settle()

    expect(callsOf('BindShortcuts')).toHaveLength(1)
    expect(callsOf('Session.Close')).toEqual([{ member: 'Session.Close', args: ['/session/one'] }])
  })

  it('keeps bindings and callbacks across suspend', async () => {
    const client = createPortalShortcuts()
    const suspended = vi.fn()
    client.register('Ctrl+D', suspended)
    client.register('Ctrl+A', vi.fn())
    client.unregisterAll()
    await settle()

    // Boot registers hotkeys before lifecycle suspends them. The portal bind
    // must still happen so the compositor can ask for approval.
    expect(callsOf('CreateSession')).toHaveLength(1)
    respond(1, 0, { session_handle: { value: '/session/one' } })
    await settle()
    respond(2)
    await settle()
    respond(3)
    await settle()
    expect(boundIds(callsOf('BindShortcuts')[0])).toEqual(['Ctrl+A', 'Ctrl+D'])

    emit({
      interface: 'org.freedesktop.portal.GlobalShortcuts',
      member: 'Activated',
      body: ['/session/one', 'Ctrl+D', 1234, {}],
    })
    // The hotkey gate logs the suspend reason; the portal layer must not drop
    // the signal before that gate sees it.
    expect(suspended).toHaveBeenCalledOnce()
    expect(callsOf('BindShortcuts')).toHaveLength(1)
    expect(callsOf('Session.Close')).toHaveLength(0)
  })

  it('logs activations even when no callback is registered', async () => {
    const client = createPortalShortcuts()
    await bindInitial(client, 'Ctrl+D')
    client.unregister('Ctrl+D')
    vi.mocked(reportBreadcrumb).mockClear()

    emit({
      interface: 'org.freedesktop.portal.GlobalShortcuts',
      member: 'Activated',
      body: ['/session/one', 'Ctrl+D', 1234, {}],
    })
    expect(reportBreadcrumb).toHaveBeenCalledWith(
      expect.stringContaining('portal shortcut activated accelerator="Ctrl+D" sessionMatch=true callback=false'),
    )
  })

  it('keeps live bindings when a replacement bind fails', async () => {
    const client = createPortalShortcuts()
    const trigger = vi.fn()
    await bindInitial(client, 'Ctrl+D', trigger)
    client.register('Escape', vi.fn())
    await settle()
    respond(4, 0, { session_handle: { value: '/session/two' } })
    await settle()
    respond(5)
    await settle()
    respond(6, 2)
    await settle()

    expect(callsOf('Session.Close')).toEqual([{ member: 'Session.Close', args: ['/session/two'] }])
    emit({
      interface: 'org.freedesktop.portal.GlobalShortcuts',
      member: 'Activated',
      body: ['/session/one', 'Ctrl+D', 1234, {}],
    })
    expect(trigger).toHaveBeenCalledOnce()
  })
})
