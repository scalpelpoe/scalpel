import { electronShortcuts } from '../../../common/electron'
import { reportBreadcrumb } from '../../../common/diagnostics'
import { currentEnv } from '../../../select'
import type { GlobalShortcuts, PlatformEnv } from '../../../types'
import { isNativeWayland } from '../display'
import { getLinuxDesktop } from '../desktop'
import { nativeOverlayServices } from '../native-overlay'
import { linuxDesktopDefaults } from '../../settings-rules'
import {
  __resetLinuxShortcutBackendForTests,
  getLinuxShortcutBackend,
  type ConcreteLinuxShortcutBackend,
} from './backend'
import { resolveLinuxShortcutBackend } from './effective'
import { createEvdevShortcuts, evdevKeyboardsReadable } from './evdev'
import { createPortalShortcuts } from './portal'

export {
  getLinuxShortcutBackend,
  setLinuxShortcutBackend,
  toLinuxShortcutBackend,
} from './backend'
export { resolveLinuxShortcutBackend } from './effective'
export { evdevKeyboardsReadable } from './evdev'
export { acceleratorToTrigger, createPortalShortcuts, portalShortcutsUnavailable } from './portal'
export type { ConcreteLinuxShortcutBackend, LinuxShortcutBackend } from './backend'
export type { LinuxShortcutFacts } from './effective'

let portalShortcuts: GlobalShortcuts | null = null
let evdevShortcuts: (GlobalShortcuts & { available(): boolean }) | null = null
// The native layer-shell host can supply its own evdev shortcut transport.
let nativeShortcuts: GlobalShortcuts | null = null
let lastSelectedBackend: ConcreteLinuxShortcutBackend | null = null

/** Installs the portal implementation. Called once by the native-Wayland boot
 *  hook, before the host app starts registering hotkeys. */
export function enablePortalShortcuts(env: PlatformEnv = currentEnv()): void {
  if (env.platform === 'linux' && !portalShortcuts) portalShortcuts = createPortalShortcuts()
}

function standaloneEvdev(): GlobalShortcuts & { available(): boolean } {
  evdevShortcuts ??= createEvdevShortcuts()
  return evdevShortcuts
}

/** Injection point for a future native overlay backend's evdev shortcuts. */
export function setLinuxNativeShortcuts(value: GlobalShortcuts | null): void {
  nativeShortcuts = value
}

function overlayShortcuts(): GlobalShortcuts | null {
  return nativeOverlayServices()?.globalShortcut ?? nativeShortcuts
}

function defaultShortcutBackend(): ConcreteLinuxShortcutBackend | undefined {
  const value = linuxDesktopDefaults(getLinuxDesktop()).shortcutBackend
  return value === 'evdev' || value === 'portal' || value === 'electron' ? value : undefined
}

function selectedBackend(env: PlatformEnv): ConcreteLinuxShortcutBackend {
  const nativeWayland = isNativeWayland(env.argv)
  const nativeOverlay = overlayShortcuts() !== null
  const selected = resolveLinuxShortcutBackend(getLinuxShortcutBackend(), {
    nativeWayland,
    nativeOverlay,
    evdevReadable: evdevKeyboardsReadable(),
    defaultBackend: defaultShortcutBackend(),
  })
  if (selected !== lastSelectedBackend) {
    lastSelectedBackend = selected
    reportBreadcrumb(
      `[linux/shortcuts] resolved=${selected} preference=${getLinuxShortcutBackend()} ` +
        `nativeWayland=${nativeWayland} nativeOverlay=${nativeOverlay} desktop=${getLinuxDesktop()}`,
      'debug',
    )
  }
  return selected
}

function primaryImplementation(env: PlatformEnv, selected: ConcreteLinuxShortcutBackend): GlobalShortcuts {
  if (env.platform !== 'linux') return electronShortcuts
  switch (selected) {
    case 'electron':
      return electronShortcuts
    case 'portal':
      return portalShortcuts ?? electronShortcuts
    case 'evdev':
      return overlayShortcuts() ?? standaloneEvdev()
  }
}

function currentPrimary(): GlobalShortcuts {
  const env = currentEnv()
  return primaryImplementation(env, selectedBackend(env))
}

// Track where each accelerator was actually registered so unregister/isRegistered
// hit the same implementation. Exactly one backend owns each accelerator: the
// compositor default is selected up front, and a failure is surfaced in the
// settings view so the user can switch backends explicitly.
const owners = new Map<string, Set<GlobalShortcuts>>()

function addOwner(accelerator: string, impl: GlobalShortcuts): void {
  let set = owners.get(accelerator)
  if (!set) {
    set = new Set()
    owners.set(accelerator, set)
  }
  set.add(impl)
}

/** Stable delegate: the backend is resolved on each call, so destructuring at
 *  import time (as the host app does) never locks in an implementation. Linux
 *  resolves portal/evdev/native; every other OS gets Electron shortcuts. */
export const platformShortcuts: GlobalShortcuts = {
  register: (accelerator, callback) => {
    const env = currentEnv()
    const selected = selectedBackend(env)
    const primary = primaryImplementation(env, selected)
    if (!primary.register(accelerator, callback)) return false
    addOwner(accelerator, primary)
    return true
  },
  unregister: (accelerator) => {
    const set = owners.get(accelerator)
    owners.delete(accelerator)
    if (set) for (const impl of set) impl.unregister(accelerator)
    else currentPrimary().unregister(accelerator)
  },
  unregisterAll: () => {
    const impls = new Set<GlobalShortcuts>()
    for (const set of owners.values()) for (const impl of set) impls.add(impl)
    owners.clear()
    impls.add(currentPrimary())
    for (const impl of impls) impl.unregisterAll()
  },
  isRegistered: (accelerator) => {
    const set = owners.get(accelerator)
    if (set) for (const impl of set) if (impl.isRegistered(accelerator)) return true
    return currentPrimary().isRegistered(accelerator)
  },
}

/** @internal Test-only reset. */
export function __resetPlatformShortcutsForTests(): void {
  portalShortcuts = null
  evdevShortcuts = null
  nativeShortcuts = null
  lastSelectedBackend = null
  owners.clear()
  __resetLinuxShortcutBackendForTests()
}
