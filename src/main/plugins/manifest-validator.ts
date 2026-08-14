import type { PluginManifest } from '../../plugin-sdk/src/types'

export type ValidationResult = { ok: true; manifest: PluginManifest } | { ok: false; error: string }

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,49}$/
const API_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

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
  if (m.api !== undefined) {
    if (m.api == null || typeof m.api !== 'object' || Array.isArray(m.api)) {
      return { ok: false, error: 'api must be an object when present' }
    }
    const api = m.api as Record<string, unknown>
    if (!isString(api.version) || !API_VERSION_PATTERN.test(api.version)) {
      return { ok: false, error: 'api.version must be a canonical major.minor.patch version' }
    }
  }
  if (m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies)) {
      return { ok: false, error: 'dependencies must be an array when present' }
    }
    if (m.dependencies.length > 32) {
      return { ok: false, error: 'dependencies must contain at most 32 entries' }
    }
    const seen = new Set<string>()
    for (const value of m.dependencies) {
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'each dependency must be an object' }
      }
      const dependency = value as Record<string, unknown>
      if (!isString(dependency.pluginId) || !PLUGIN_ID_PATTERN.test(dependency.pluginId)) {
        return { ok: false, error: 'dependency.pluginId must be a valid plugin id' }
      }
      if (dependency.pluginId === m.id) {
        return { ok: false, error: 'a plugin cannot depend on itself' }
      }
      if (seen.has(dependency.pluginId)) {
        return { ok: false, error: `duplicate dependency "${dependency.pluginId}"` }
      }
      seen.add(dependency.pluginId)
      if (!isString(dependency.apiVersion) || !API_VERSION_PATTERN.test(dependency.apiVersion)) {
        return { ok: false, error: 'dependency.apiVersion must be a canonical major.minor.patch version' }
      }
      if (dependency.optional !== undefined && typeof dependency.optional !== 'boolean') {
        return { ok: false, error: 'dependency.optional must be a boolean when present' }
      }
    }
  }
  return { ok: true, manifest: m as unknown as PluginManifest }
}
