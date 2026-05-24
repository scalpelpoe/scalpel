import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { PLUGIN_ID_PATTERN } from './manifest-validator'
import { pluginEntryPath } from './paths'

const SCHEME = 'scalpel-plugin'

/**
 * Parse a scalpel-plugin:// URL into the plugin id and the requested file.
 * Exported for unit testing.
 *
 * Shape: scalpel-plugin://<id>/plugin.js
 *   - hostname carries the plugin id (matches PLUGIN_ID_PATTERN, all valid hostname chars)
 *   - pathname must be exactly /plugin.js (v1 manifests only ship a single entry)
 *
 * Returns null on any shape that doesn't match - the protocol handler turns
 * that into a 400 so renderer-side errors carry the rejected URL.
 */
export function parsePluginUrl(rawUrl: string): { id: string; file: 'plugin.js' } | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${SCHEME}:`) return null
  const id = url.hostname
  if (!PLUGIN_ID_PATTERN.test(id)) return null
  if (url.pathname !== '/plugin.js') return null
  return { id, file: 'plugin.js' }
}

export function registerScalpelPluginProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const parsed = parsePluginUrl(request.url)
    if (!parsed) {
      return new Response('Bad plugin URL', { status: 400 })
    }
    const filePath = pluginEntryPath(parsed.id)
    if (!existsSync(filePath)) {
      return new Response(`Missing plugin entry: ${parsed.id}/plugin.js`, { status: 404 })
    }
    // Same pattern as scalpel-internal:// - re-wrap so we control the
    // content-type the renderer sees. .js files served via file:// often come
    // back without one, which makes Chromium reject the module.
    const inner = await net.fetch(pathToFileURL(filePath).toString())
    return new Response(inner.body, {
      status: inner.status,
      headers: { 'content-type': 'application/javascript' },
    })
  })
}

/** Must be called BEFORE app.whenReady(); registerSchemesAsPrivileged only
 *  takes effect at the very start of the app lifecycle. */
export function registerScalpelPluginSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ])
}

/** Build the import URL the renderer hands to dynamic `import()`. */
export function pluginEntryUrl(pluginId: string): string {
  return `${SCHEME}://${pluginId}/plugin.js`
}
