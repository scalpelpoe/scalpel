import type { PluginApiClient, PluginCommunicationApi, PluginManifest } from '../../../plugin-sdk/src/types'

// Mirrors plugin-communication.ts, which owns the real runtime and its messages.
const PROTOBUF_SERVICE_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*$/
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,49}$/

/**
 * The `plugins` API handed to a plugin re-activated inside a pop-out /
 * annotation overlay window. Plugin services are renderer-local to the MAIN
 * overlay, which already ran activate and holds the real
 * PluginCommunicationRuntime, so this copy validates exactly like the primary
 * and then declines: `expose` is a no-op and `get` returns a client that
 * rejects. Without it a provider (exposePluginService calls expose
 * unconditionally) or a required consumer (createPluginServiceClient throws on
 * a null client) would fail activation and the pop-out would show
 * "Plugin error: ..." instead of its overlay.
 */
export function createSecondaryPluginCommunicationApi(manifest: PluginManifest): PluginCommunicationApi {
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
      // No-op: consumers live in the main overlay and talk to the copy exposed there.
    },
    get: (pluginId, serviceTypeName) => {
      validatePluginId(pluginId, 'provider id')
      validateServiceTypeName(serviceTypeName)
      const dependency = manifest.dependencies?.find((candidate) => candidate.pluginId === pluginId)
      if (!dependency) {
        throw new Error(`[plugin:${manifest.id}] dependency "${pluginId}" is not declared`)
      }
      if (dependency.optional) return null
      return createUnavailableClient(pluginId, dependency.apiVersion, serviceTypeName)
    },
  }
}

/** A well-formed client that always rejects, so activation survives and only an actual call fails. */
function createUnavailableClient(pluginId: string, apiVersion: string, serviceTypeName: string): PluginApiClient {
  return {
    pluginId,
    apiVersion,
    serviceTypeName,
    call: async () => {
      throw new Error(`plugin API "${pluginId}" is not available in secondary overlay windows`)
    },
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
