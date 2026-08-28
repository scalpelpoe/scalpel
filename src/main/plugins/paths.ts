import { join } from 'node:path'
import { app } from 'electron'

export function pluginsDir(): string {
  return join(app.getPath('userData'), 'plugins')
}

export function pluginDir(id: string): string {
  return join(pluginsDir(), id)
}

export function pluginStorageDir(id: string): string {
  return join(app.getPath('userData'), 'plugin-storage', id)
}

export function pluginStoragePath(id: string): string {
  return join(pluginStorageDir(id), 'storage.json')
}

export function pendingPluginStorageDeletionsPath(): string {
  return join(app.getPath('userData'), 'plugin-storage', 'pending-deletions.json')
}

export function installedJsonPath(): string {
  return join(pluginsDir(), 'installed.json')
}

export function unpackedJsonPath(): string {
  return join(pluginsDir(), 'unpacked.json')
}

export function pluginEntryPath(id: string): string {
  return join(pluginDir(id), 'plugin.js')
}

export function pluginManifestPath(id: string): string {
  return join(pluginDir(id), 'manifest.json')
}
