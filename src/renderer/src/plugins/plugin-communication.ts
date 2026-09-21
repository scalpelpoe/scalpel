import type {
  PluginApiClient,
  PluginApiHandler,
  PluginCommunicationApi,
  PluginManifest,
} from '../../../plugin-sdk/src/types'

interface Provider {
  version: string
  serviceTypeName: string
  handler: PluginApiHandler
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,49}$/
const API_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const PROTOBUF_SERVICE_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*$/
const PROTOBUF_METHOD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export class PluginCommunicationRuntime {
  private readonly providers = new Map<string, Provider>()

  createApi(manifest: PluginManifest): PluginCommunicationApi {
    validateCommunicationManifest(manifest)
    return {
      expose: (serviceTypeName, handler) => {
        if (!manifest.api) {
          throw new Error(`[plugin:${manifest.id}] cannot expose an API not declared in its manifest`)
        }
        validateServiceTypeName(serviceTypeName)
        if (serviceTypeName !== manifest.api.service) {
          throw new Error(
            `[plugin:${manifest.id}] cannot expose service "${serviceTypeName}"; manifest declares "${manifest.api.service}"`,
          )
        }
        if (typeof handler !== 'function') {
          throw new Error(`[plugin:${manifest.id}] plugin API handler must be a function`)
        }
        if (this.providers.has(manifest.id)) {
          throw new Error(`[plugin:${manifest.id}] API already exposed`)
        }
        this.providers.set(manifest.id, { version: manifest.api.version, serviceTypeName, handler })
      },
      get: (pluginId, serviceTypeName) => {
        validatePluginId(pluginId, 'provider id')
        validateServiceTypeName(serviceTypeName)
        const dependency = manifest.dependencies?.find((candidate) => candidate.pluginId === pluginId)
        if (!dependency) {
          throw new Error(`[plugin:${manifest.id}] dependency "${pluginId}" is not declared`)
        }
        const provider = this.providers.get(pluginId)
        if (!provider || provider.version !== dependency.apiVersion) {
          if (dependency.optional) return null
          throw new Error(`[plugin:${manifest.id}] required plugin API "${pluginId}" is unavailable`)
        }
        if (provider.serviceTypeName !== serviceTypeName) {
          throw new Error(
            `[plugin:${manifest.id}] plugin API "${pluginId}" does not expose service "${serviceTypeName}"`,
          )
        }
        return this.createClient(pluginId, provider.version, serviceTypeName)
      },
    }
  }

  assertDependenciesAvailable(manifest: PluginManifest): void {
    validateCommunicationManifest(manifest)
    for (const dependency of manifest.dependencies ?? []) {
      if (dependency.optional) continue
      const provider = this.providers.get(dependency.pluginId)
      if (!provider || provider.version !== dependency.apiVersion) {
        throw new Error(`[plugin:${manifest.id}] required plugin API "${dependency.pluginId}" is unavailable`)
      }
    }
  }

  assertActivationComplete(manifest: PluginManifest): void {
    if (!manifest.api) return
    const provider = this.providers.get(manifest.id)
    if (!provider || provider.version !== manifest.api.version || provider.serviceTypeName !== manifest.api.service) {
      throw new Error(
        `[plugin:${manifest.id}] declared API service "${manifest.api.service}" was not exposed during activation`,
      )
    }
  }

  remove(pluginId: string): void {
    this.providers.delete(pluginId)
  }

  private createClient(pluginId: string, apiVersion: string, serviceTypeName: string): PluginApiClient {
    return {
      pluginId,
      apiVersion,
      serviceTypeName,
      call: async <TResult>(method: string, params?: unknown): Promise<TResult> => {
        validateMethodPath(serviceTypeName, method)
        const provider = this.providers.get(pluginId)
        if (!provider || provider.version !== apiVersion || provider.serviceTypeName !== serviceTypeName) {
          throw new Error(`plugin API "${pluginId}" is unavailable`)
        }
        const request = cloneValue(params ?? null)
        const result = await Promise.resolve().then(() => provider.handler(method, request))
        return cloneValue(result) as TResult
      },
    }
  }
}

function validateCommunicationManifest(manifest: PluginManifest): void {
  if (!manifest || typeof manifest !== 'object') throw new Error('invalid plugin manifest')
  validatePluginId(manifest.id, 'manifest id')
  if (manifest.api !== undefined) {
    if (!manifest.api || typeof manifest.api !== 'object') {
      throw new Error(`[plugin:${manifest.id}] invalid API declaration`)
    }
    if (!API_VERSION_PATTERN.test(manifest.api.version)) throw new Error(`[plugin:${manifest.id}] invalid API version`)
    validateServiceTypeName(manifest.api.service)
  }
  if (manifest.dependencies !== undefined && !Array.isArray(manifest.dependencies)) {
    throw new Error(`[plugin:${manifest.id}] dependencies must be an array`)
  }
  const seen = new Set<string>()
  for (const dependency of manifest.dependencies ?? []) {
    if (!dependency || typeof dependency !== 'object') {
      throw new Error(`[plugin:${manifest.id}] invalid dependency declaration`)
    }
    validatePluginId(dependency.pluginId, 'dependency provider id')
    if (dependency.pluginId === manifest.id) throw new Error(`[plugin:${manifest.id}] cannot depend on itself`)
    if (seen.has(dependency.pluginId)) {
      throw new Error(`[plugin:${manifest.id}] duplicate dependency "${dependency.pluginId}"`)
    }
    seen.add(dependency.pluginId)
    if (!API_VERSION_PATTERN.test(dependency.apiVersion)) {
      throw new Error(`[plugin:${manifest.id}] invalid dependency API version for "${dependency.pluginId}"`)
    }
    if (dependency.optional !== undefined && typeof dependency.optional !== 'boolean') {
      throw new Error(`[plugin:${manifest.id}] invalid optional flag for "${dependency.pluginId}"`)
    }
  }
}

function validatePluginId(pluginId: string, field: string): void {
  if (typeof pluginId !== 'string' || !PLUGIN_ID_PATTERN.test(pluginId)) throw new Error(`invalid ${field}`)
}

function validateServiceTypeName(serviceTypeName: string): void {
  if (typeof serviceTypeName !== 'string' || !PROTOBUF_SERVICE_PATTERN.test(serviceTypeName)) {
    throw new Error('invalid Protobuf service type name')
  }
}

function validateMethodPath(serviceTypeName: string, method: string): void {
  const prefix = `/${serviceTypeName}/`
  if (
    typeof method !== 'string' ||
    !method.startsWith(prefix) ||
    !PROTOBUF_METHOD_PATTERN.test(method.slice(prefix.length))
  ) {
    throw new Error(`plugin API method must be a canonical path for service "${serviceTypeName}"`)
  }
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value)
  } catch {
    throw new Error('plugin API values must be structured-cloneable')
  }
}
