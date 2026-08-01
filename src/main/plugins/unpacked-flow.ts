import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { InstallResult } from './install-types'

export interface UnpackedFlowDeps {
  /** Ids installed right now - read BEFORE the install to tell a first load
   *  from a re-install over a plugin that is already running. */
  installedIds: () => string[]
  install: (sourceDir: string) => InstallResult
  manifestOf: (id: string) => PluginManifest | undefined
  entryUrl: (id: string, version: string) => string
  broadcast: (
    channel: 'plugin-installed' | 'plugin-updated',
    payload: { manifest: PluginManifest; entryUrl: string },
  ) => void
  reloadOverlay: (id: string) => void
  /** Where this plugin was last loaded from, or null when unknown (installed
   *  before source dirs were tracked, or not side-loaded at all). */
  sourceDirOf: (id: string) => string | null
  dirExists: (dir: string) => boolean
}

/** Install (or re-install) an unpacked plugin from `sourceDir` and tell the
 *  renderer which path to take.
 *
 *  A first install is a fresh load. A re-install - the plugin dev loop: rebuild,
 *  load again - must be an unload-then-reload instead, because `plugin-installed`
 *  re-runs activate() on a plugin that never tore down: its tab registration
 *  no-ops and the previous subscription set is orphaned. That is what used to
 *  make an app restart the only way to pick up freshly-built plugin code. */
export function installUnpackedAndNotify(sourceDir: string, deps: UnpackedFlowDeps): InstallResult {
  const wasInstalled = new Set(deps.installedIds())
  const result = deps.install(sourceDir)
  if (!result.ok) return result

  const manifest = deps.manifestOf(result.id)
  if (!manifest) return result

  const channel = wasInstalled.has(result.id) ? 'plugin-updated' : 'plugin-installed'
  deps.broadcast(channel, { manifest, entryUrl: deps.entryUrl(manifest.id, manifest.version) })
  // The popped-out overlay window does not listen for plugin-updated; reload it
  // so it re-imports the new code instead of running stale.
  if (channel === 'plugin-updated') deps.reloadOverlay(manifest.id)
  return result
}

/** Re-copy a side-loaded plugin from the directory it was loaded from and
 *  hot-swap it. This is the plugin dev loop: rebuild, click Reload, run the new
 *  code - no app restart. */
export function reloadUnpackedPlugin(pluginId: string, deps: UnpackedFlowDeps): InstallResult {
  const sourceDir = deps.sourceDirOf(pluginId)
  if (!sourceDir) {
    return {
      ok: false,
      error: 'Scalpel does not know where this plugin was loaded from. Load it unpacked again to enable Reload.',
    }
  }
  if (!deps.dirExists(sourceDir)) {
    return { ok: false, error: `Source directory no longer exists: ${sourceDir}` }
  }
  return installUnpackedAndNotify(sourceDir, deps)
}
