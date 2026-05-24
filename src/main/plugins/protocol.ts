import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, protocol } from 'electron'

const SCHEME = 'scalpel-internal'

const KNOWN_MODULES = new Set(['sdk.js', 'react.js'])

// Resolve from inside the asar when packaged (app.getAppPath() is the asar path).
// Keeps the SDK/React shim version-locked to app.asar so auto-updates swap it atomically.
export function internalAssetDir(): string {
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
    const bytes = readFileSync(filePath)
    return new Response(bytes, {
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
