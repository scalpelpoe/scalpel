import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

/** The Scalpel Stream publish token, kept out of settings.json. Encrypted with
 *  the OS keystore (DPAPI / Keychain / libsecret) when available; on a Linux
 *  desktop without a keyring it falls back to a user-only file. The token can
 *  only publish to this streamer's own overlay, so that fallback is acceptable. */

interface TokenFile {
  v: 1
  encrypted: boolean
  data: string
}

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'stream-token.json')
}

export async function saveStreamToken(token: string): Promise<void> {
  const encrypted = safeStorage.isEncryptionAvailable()
  const data = encrypted ? safeStorage.encryptString(token).toString('base64') : token
  const file: TokenFile = { v: 1, encrypted, data }
  await fs.writeFile(tokenPath(), JSON.stringify(file), { encoding: 'utf8', mode: 0o600 })
}

export async function loadStreamToken(): Promise<string | null> {
  try {
    const file = JSON.parse(await fs.readFile(tokenPath(), 'utf8')) as TokenFile
    if (file.v !== 1 || typeof file.data !== 'string') return null
    return file.encrypted ? safeStorage.decryptString(Buffer.from(file.data, 'base64')) : file.data
  } catch {
    return null
  }
}

export async function clearStreamToken(): Promise<void> {
  await fs.rm(tokenPath(), { force: true })
}
