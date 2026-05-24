import { existsSync, readFileSync } from 'node:fs'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import { readInstalledIds } from './installed-list'
import { validateManifest } from './manifest-validator'
import { pluginEntryPath, pluginManifestPath } from './paths'

export interface InstalledPlugin {
  manifest: PluginManifest
  entryPath: string
  manifestPath: string
}

function readManifestFor(id: string): PluginManifest | null {
  const p = pluginManifestPath(id)
  if (!existsSync(p)) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
  const v = validateManifest(raw)
  if (!v.ok) return null
  if (v.manifest.id !== id) return null
  return v.manifest
}

export function getInstalledPlugins(): InstalledPlugin[] {
  const ids = readInstalledIds()
  const out: InstalledPlugin[] = []
  for (const id of ids) {
    const m = readManifestFor(id)
    if (!m) continue
    out.push({
      manifest: m,
      entryPath: pluginEntryPath(id),
      manifestPath: pluginManifestPath(id),
    })
  }
  return out
}
