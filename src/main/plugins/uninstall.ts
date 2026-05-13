import { existsSync, rmSync } from 'fs'
import { pluginDir } from './paths'
import { PLUGIN_ID_PATTERN } from './manifest-validator'
import { removeInstalledId } from './installed-list'

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

  return { ok: true }
}
