import type { PluginManifest } from '../../plugin-sdk/src/types'

export type ValidationResult = { ok: true; manifest: PluginManifest } | { ok: false; error: string }

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,49}$/
const API_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CONTRACT_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\.binpb$/
const PROTOBUF_SERVICE_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*$/
const ASSET_FILENAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,98}[a-zA-Z0-9])?$/
const WINDOWS_DEVICE_FILENAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const SHA256_PATTERN = /^[a-f0-9]{64}$/

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
    if (
      !isString(api.contract) ||
      !CONTRACT_FILENAME_PATTERN.test(api.contract) ||
      api.contract.toLowerCase() === 'manifest.json' ||
      WINDOWS_DEVICE_FILENAME_PATTERN.test(api.contract)
    ) {
      return { ok: false, error: 'api.contract must be a safe root-level .binpb filename' }
    }
    if (!isString(api.service) || !PROTOBUF_SERVICE_PATTERN.test(api.service)) {
      return { ok: false, error: 'api.service must be a fully qualified Protobuf service name' }
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
  if (m.nativeBackend !== undefined) {
    if (m.nativeBackend == null || typeof m.nativeBackend !== 'object' || Array.isArray(m.nativeBackend)) {
      return { ok: false, error: 'nativeBackend must be an object when present' }
    }
    const backend = m.nativeBackend as Record<string, unknown>
    if (backend.protocolVersion !== 1) {
      return { ok: false, error: 'nativeBackend.protocolVersion must be 1' }
    }
    if (
      !isString(backend.contract) ||
      !CONTRACT_FILENAME_PATTERN.test(backend.contract) ||
      backend.contract.toLowerCase() === 'manifest.json' ||
      WINDOWS_DEVICE_FILENAME_PATTERN.test(backend.contract) ||
      (m.api as { contract?: string } | undefined)?.contract?.toLowerCase() === backend.contract.toLowerCase()
    ) {
      return { ok: false, error: 'nativeBackend.contract must be a unique safe root-level .binpb filename' }
    }
    if (!isString(backend.service) || !PROTOBUF_SERVICE_PATTERN.test(backend.service)) {
      return { ok: false, error: 'nativeBackend.service must be a fully qualified Protobuf service name' }
    }
    if (backend.targets == null || typeof backend.targets !== 'object' || Array.isArray(backend.targets)) {
      return { ok: false, error: 'nativeBackend.targets must be an object' }
    }
    const targets = backend.targets as Record<string, unknown>
    const targetNames = Object.keys(targets)
    if (targetNames.length === 0 || targetNames.some((name) => name !== 'win32-x64')) {
      return { ok: false, error: 'nativeBackend.targets must declare at least one supported target' }
    }
    for (const targetName of targetNames) {
      const value = targets[targetName]
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: `nativeBackend target "${targetName}" must be an object` }
      }
      const target = value as Record<string, unknown>
      const targetFile = isString(target.file) ? target.file.toLowerCase() : ''
      if (
        !isString(target.file) ||
        !ASSET_FILENAME_PATTERN.test(target.file) ||
        WINDOWS_DEVICE_FILENAME_PATTERN.test(target.file) ||
        ['manifest.json', 'plugin.js', backend.contract.toLowerCase()].includes(targetFile) ||
        (m.api as { contract?: string } | undefined)?.contract?.toLowerCase() === targetFile
      ) {
        return { ok: false, error: `nativeBackend target "${targetName}" must use a unique safe root-level file` }
      }
      if (!isString(target.sha256) || !SHA256_PATTERN.test(target.sha256)) {
        return { ok: false, error: `nativeBackend target "${targetName}" must declare a lowercase SHA-256` }
      }
    }
  }
  return { ok: true, manifest: m as unknown as PluginManifest }
}
