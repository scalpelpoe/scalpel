export interface InstallManifest {
  version: string
  electronVersion: string
  asarUrl: string
  asarSha512: string
  asarSize: number
  unpackedUrl?: string
  unpackedSha512?: string
  unpackedSize?: number
  nativeModules: Record<string, string>
  brickedReleases?: string[]
  brickedMessage?: string
}

export interface Manifest {
  ninjaLeagues: {
    poe1: Record<string, string>
    poe2: Record<string, string>
  }
  poe2NinjaCategories: Record<string, string>
}

export type AuthResult = { loggedIn: true; accountName: string } | { loggedIn: false }
