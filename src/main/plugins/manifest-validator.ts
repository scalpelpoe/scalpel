import type { PluginManifest } from '../../plugin-sdk/src/types'

export type ValidationResult = { ok: true; manifest: PluginManifest } | { ok: false; error: string }

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,49}$/

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isPoeVersionArray(v: unknown): v is (1 | 2)[] {
  return Array.isArray(v) && v.every((x) => x === 1 || x === 2)
}

export function validateManifest(raw: unknown): ValidationResult {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'manifest must be an object' }
  }
  const m = raw as Record<string, unknown>
  if (m.manifestVersion !== 1) {
    return {
      ok: false,
      error: `unsupported manifestVersion (expected 1, got ${String(m.manifestVersion)})`,
    }
  }
  for (const k of ['id', 'version', 'name', 'description', 'author', 'scalpelMinVersion']) {
    if (!isString(m[k]) || (m[k] as string).length === 0) {
      return { ok: false, error: `field "${k}" must be a non-empty string` }
    }
  }
  if (!PLUGIN_ID_PATTERN.test(m.id as string)) {
    return { ok: false, error: `id "${String(m.id)}" must match ${PLUGIN_ID_PATTERN}` }
  }
  if (m.poeVersions !== undefined && !isPoeVersionArray(m.poeVersions)) {
    return { ok: false, error: 'poeVersions must be (1 | 2)[] when present' }
  }
  if (m.homepage !== undefined && !isString(m.homepage)) {
    return { ok: false, error: 'homepage must be a string when present' }
  }
  if (m.tabIcon !== undefined && !isString(m.tabIcon)) {
    return { ok: false, error: 'tabIcon must be a string when present' }
  }
  if (m.iconUrl !== undefined && !isString(m.iconUrl)) {
    return { ok: false, error: 'iconUrl must be a string when present' }
  }
  return { ok: true, manifest: m as unknown as PluginManifest }
}
