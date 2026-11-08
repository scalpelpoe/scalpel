import type { RegistryEntry } from '@shared/plugin-registry-types'

/** True when a registry entry pins a native (win32-x64) executable asset.
 *
 *  Checking for a root-level `.exe` key in `assets` is exact, not a heuristic:
 *  the manifest validator only accepts a `win32-x64` nativeBackend target whose
 *  `file` is a root-level `.exe` filename, and a registry install can only supply
 *  that file by pinning it in `assets`. So an entry with no `.exe` asset cannot
 *  install a native plugin, and one that has one always does. */
export function isNativeRegistryEntry(entry: RegistryEntry): boolean {
  return Object.keys(entry.assets ?? {}).some((name) => name.toLowerCase().endsWith('.exe'))
}
