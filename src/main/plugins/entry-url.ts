import { statSync } from 'node:fs'
import { pluginEntryPath } from './paths'
import { pluginEntryUrl } from './plugin-protocol'

/** Entry URL carrying a cache key the renderer's module map cannot collide on.
 *
 *  The version alone is not enough: an unpacked plugin under development is
 *  rebuilt over and over at the same version, and `import()` of an already-seen
 *  URL returns the cached module - so the old code keeps running. The entry
 *  file's mtime changes on every re-install, which is exactly the signal we
 *  want. */
export function versionedPluginEntryUrl(pluginId: string, version: string): string {
  let stamp = ''
  try {
    stamp = `-${Math.round(statSync(pluginEntryPath(pluginId)).mtimeMs)}`
  } catch {
    // Entry file unreadable: fall back to the version. The import will 404
    // anyway, and the protocol handler reports that with the URL.
  }
  return `${pluginEntryUrl(pluginId)}?v=${version}${stamp}`
}
