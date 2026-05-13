import { protocol, net, app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

const SCHEME = 'scalpel-internal'

const KNOWN_MODULES = new Set(['sdk.js', 'react.js'])

function internalAssetDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'scalpel-internal')
  }
  return join(app.getAppPath(), 'out', 'scalpel-internal')
}

export function registerScalpelInternalProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    // url.hostname is the part after scheme://, e.g. "sdk.js" for scalpel-internal://sdk.js
    const name = url.hostname + (url.pathname === '/' ? '' : url.pathname.replace(/^\//, ''))
    if (!KNOWN_MODULES.has(name)) {
      return new Response('Not found', { status: 404 })
    }
    const filePath = join(internalAssetDir(), name)
    if (!existsSync(filePath)) {
      return new Response(`Missing internal asset: ${name}`, { status: 500 })
    }
    // Wrap the response so we can set content-type on what we hand back to the
    // renderer. The `headers` option on net.fetch is RequestInit (outbound),
    // not response headers, so a direct return would inherit whatever
    // content-type the file:// fetch resolves with (often missing for .js).
    const inner = await net.fetch(pathToFileURL(filePath).toString())
    return new Response(inner.body, {
      status: inner.status,
      headers: { 'content-type': 'application/javascript' },
    })
  })
}

// Must be called BEFORE app.whenReady(). registerSchemesAsPrivileged only takes
// effect at the very start of the app lifecycle.
export function registerScalpelInternalSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ])
}
