import { app } from 'electron'
import { join } from 'path'

export function pluginsDir(): string {
  return join(app.getPath('userData'), 'plugins')
}

export function pluginDir(id: string): string {
  return join(pluginsDir(), id)
}

export function installedJsonPath(): string {
  return join(pluginsDir(), 'installed.json')
}

export function pluginEntryPath(id: string): string {
  return join(pluginDir(id), 'plugin.js')
}

export function pluginManifestPath(id: string): string {
  return join(pluginDir(id), 'manifest.json')
}
