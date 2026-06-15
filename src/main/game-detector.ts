// active-win is ESM-only; dynamic import lets us consume it from our CJS main.
// The module and its native binding load once, then we reuse the cached fn.
type ActiveWindowFn = () => Promise<{ title?: string } | undefined>
type OpenWindowsFn = () => Promise<{ title: string }[]>

let activeWindow: ActiveWindowFn | null = null
let openWindowsFn: OpenWindowsFn | null = null

async function getActiveWindow(): Promise<ActiveWindowFn> {
  if (activeWindow) return activeWindow
  const mod = (await import('active-win')) as { activeWindow: ActiveWindowFn }
  activeWindow = mod.activeWindow
  return activeWindow
}

async function getOpenWindows(): Promise<OpenWindowsFn> {
  if (openWindowsFn) return openWindowsFn
  const mod = (await import('active-win')) as { openWindows: OpenWindowsFn }
  openWindowsFn = mod.openWindows
  return openWindowsFn
}

import type { GameVariant } from '@shared/types'

const TITLE_TO_VERSION: Record<string, GameVariant> = {
  'Path of Exile': 1,
  'Path of Exile 2': 2,
}

/** Returns the PoE version of whichever window currently has OS foreground focus,
 *  or null if it's not a PoE window (or the OS lookup failed). Called on hotkey
 *  fire to decide whether we need to swap which game the overlay is attached to. */
export async function detectFocusedPoeVersion(): Promise<GameVariant | null> {
  try {
    const fn = await getActiveWindow()
    const win = await fn()
    const title = win?.title
    return title ? (TITLE_TO_VERSION[title] ?? null) : null
  } catch {
    return null
  }
}

/** Returns the set of PoE versions that currently have at least one open window
 *  anywhere on the desktop. Used as a fallback when no PoE window has focus:
 *  if exactly one variant is detected and it differs from the active profile,
 *  we can still prompt the user to switch. */
export async function detectOpenPoeVersions(): Promise<Set<GameVariant>> {
  try {
    const fn = await getOpenWindows()
    const windows = await fn()
    const versions = new Set<GameVariant>()
    for (const win of windows) {
      const v = TITLE_TO_VERSION[win.title]
      if (v) versions.add(v)
    }
    return versions
  } catch {
    return new Set()
  }
}
