import type {
  PluginApiClient,
  PluginApiHandler,
  PluginCommunicationApi,
  PluginManifest,
} from '../../../plugin-sdk/src/types'

interface Provider {
  version: string
  handler: PluginApiHandler
}

export class PluginCommunicationRuntime {
  private readonly providers = new Map<string, Provider>()

  createApi(manifest: PluginManifest): PluginCommunicationApi {
    return {
      expose: (handler) => {
        if (!manifest.api) {
          throw new Error(`[plugin:${manifest.id}] cannot expose an API not declared in its manifest`)
        }
        if (this.providers.has(manifest.id)) {
          throw new Error(`[plugin:${manifest.id}] API already exposed`)
        }
        this.providers.set(manifest.id, { version: manifest.api.version, handler })
      },
      get: (pluginId) => {
        const dependency = manifest.dependencies?.find((candidate) => candidate.pluginId === pluginId)
        if (!dependency) {
          throw new Error(`[plugin:${manifest.id}] dependency "${pluginId}" is not declared`)
        }
        const provider = this.providers.get(pluginId)
        if (!provider || provider.version !== dependency.apiVersion) {
          if (dependency.optional) return null
          throw new Error(`[plugin:${manifest.id}] required plugin API "${pluginId}" is unavailable`)
        }
        return this.createClient(pluginId, provider.version)
      },
    }
  }

  remove(pluginId: string): void {
    this.providers.delete(pluginId)
  }

  private createClient(pluginId: string, apiVersion: string): PluginApiClient {
    return {
      pluginId,
      apiVersion,
      call: async <TResult>(method: string, params?: unknown): Promise<TResult> => {
        if (!method) throw new Error('plugin API method must not be empty')
        const provider = this.providers.get(pluginId)
        if (!provider || provider.version !== apiVersion) {
          throw new Error(`plugin API "${pluginId}" is unavailable`)
        }
        const request = cloneValue(params ?? null)
        const result = await Promise.resolve().then(() => provider.handler(method, request))
        return cloneValue(result) as TResult
      },
    }
  }
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value)
  } catch {
    throw new Error('plugin API values must be structured-cloneable')
  }
}
