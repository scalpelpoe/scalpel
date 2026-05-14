import { existsSync, rmSync } from 'fs'
import { pluginDir } from './paths'
import { PLUGIN_ID_PATTERN } from './manifest-validator'
import { removeInstalledId } from './installed-list'
import { clearCache } from './storage'

export type UninstallResult = { ok: true } | { ok: false; error: string }

export function uninstallPlugin(pluginId: string): UninstallResult {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    return { ok: false, error: 'invalid plugin id' }
  }

  // Remove the plugin directory if it exists.
  const dir = pluginDir(pluginId)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }

  // Update installed.json.
  removeInstalledId(pluginId)
  clearCache(pluginId)

  return { ok: true }
}
