import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { homedir as osHomedir } from 'node:os'
import { posix, win32 } from 'node:path'
import type { GameVariant } from '@shared/types'

const EXE_NAME_RE = /PathOfExile/i
const STEAM_GAME_DIR: Record<GameVariant, string> = {
  1: 'Path of Exile',
  2: 'Path of Exile 2',
}

type PathApi = { join: (...parts: string[]) => string; dirname: (p: string) => string }

/** Path ops for the *target* platform (deps.platform), not the host OS.
 *  Lets Linux resolution keep posix separators when unit tests run on Windows CI. */
function pathApiFor(platform: NodeJS.Platform): PathApi {
  if (platform === 'win32') return win32
  return posix
}

export interface PathResolverFs {
  existsSync(path: string): boolean
  readdirSync(path: string): string[]
  readFileSync(path: string, encoding: 'utf8'): string
  readlinkSync(path: string): string
}

export interface PathResolverDeps {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homedir?: string
  fs?: PathResolverFs
  execUtf8?: (file: string, args: string[]) => string
  poeVersion?: GameVariant
}

const defaultFs: PathResolverFs = {
  existsSync,
  readdirSync: (path) => readdirSync(path),
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  readlinkSync: (path) => readlinkSync(path),
}

function defaultExecUtf8(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: 'utf8', timeout: 5000, windowsHide: true })
}

/** Best-effort resolve the absolute Client.txt path for the running PoE
 *  process. Windows asks PowerShell for PathOfExile*; Linux/macOS scan the
 *  process list and Steam library folders. SCALPEL_CLIENT_LOG overrides.
 *
 *  Returns null on any failure. Callers should treat null as "watcher
 *  doesn't start". Silent by design unless SCALPEL_DEBUG_LOG is set. */
export function resolveClientLogPath(deps: PathResolverDeps = {}): string | null {
  const platform = deps.platform ?? process.platform
  const env = deps.env ?? process.env
  const fs = deps.fs ?? defaultFs
  const home = deps.homedir ?? osHomedir()
  const execUtf8 = deps.execUtf8 ?? defaultExecUtf8
  const version = deps.poeVersion ?? 2
  const path = pathApiFor(platform)

  const fromEnv = clientTxtIfExists(env.SCALPEL_CLIENT_LOG, fs)
  if (fromEnv) return fromEnv

  try {
    if (platform === 'win32') return resolveWindows(execUtf8, fs, path)
    if (platform === 'linux') return resolveLinux(fs, home, version, path)
    if (platform === 'darwin') return resolveDarwin(execUtf8, fs, home, version, path)
  } catch (err) {
    if (env.SCALPEL_DEBUG_LOG) console.warn('[client-log] path resolver failed', err)
    return null
  }
  return null
}

function clientTxtIfExists(path: string | undefined, fs: PathResolverFs): string | null {
  if (!path) return null
  return fs.existsSync(path) ? path : null
}

function clientTxtBesideExe(exePath: string, fs: PathResolverFs, path: PathApi): string | null {
  if (!exePath) return null
  const candidate = path.join(path.dirname(exePath), 'logs', 'Client.txt')
  return fs.existsSync(candidate) ? candidate : null
}

function resolveWindows(
  execUtf8: NonNullable<PathResolverDeps['execUtf8']>,
  fs: PathResolverFs,
  path: PathApi,
): string | null {
  const out = execUtf8('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process -Name 'PathOfExile*' | Select-Object -First 1 -ExpandProperty Path",
  ])
  const exePath = out.trim()
  if (!exePath) return null
  const candidate = path.join(path.dirname(exePath), 'logs', 'Client.txt')
  if (!fs.existsSync(candidate)) {
    if (process.env.SCALPEL_DEBUG_LOG) console.warn('[client-log] path resolver: not found at', candidate)
    return null
  }
  return candidate
}

function resolveLinux(fs: PathResolverFs, home: string, version: GameVariant, path: PathApi): string | null {
  const fromProc = resolveFromLinuxProc(fs, path)
  if (fromProc) return fromProc
  return resolveFromSteamLibraries(fs, linuxSteamRoots(home, path), version, path)
}

function resolveDarwin(
  execUtf8: NonNullable<PathResolverDeps['execUtf8']>,
  fs: PathResolverFs,
  home: string,
  version: GameVariant,
  path: PathApi,
): string | null {
  try {
    const out = execUtf8('ps', ['-ax', '-o', 'command='])
    for (const line of out.split('\n')) {
      if (!EXE_NAME_RE.test(line)) continue
      const exe = extractExePath(line)
      const candidate = exe ? clientTxtBesideExe(exe, fs, path) : null
      if (candidate) return candidate
    }
  } catch {
    /* ps unavailable */
  }
  return resolveFromSteamLibraries(fs, darwinSteamRoots(home, path), version, path)
}

function linuxSteamRoots(home: string, path: PathApi): string[] {
  return [
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.steam', 'steam'),
    path.join(home, '.steam', 'root'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ]
}

function darwinSteamRoots(home: string, path: PathApi): string[] {
  return [path.join(home, 'Library', 'Application Support', 'Steam')]
}

function resolveFromLinuxProc(fs: PathResolverFs, path: PathApi): string | null {
  let pids: string[]
  try {
    pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n))
  } catch {
    return null
  }
  for (const pid of pids) {
    let cmdline = ''
    try {
      cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    } catch {
      continue
    }
    if (!EXE_NAME_RE.test(cmdline) && !cmdlineIncludesPoeDir(cmdline)) continue

    try {
      const exe = fs.readlinkSync(`/proc/${pid}/exe`)
      const candidate = clientTxtBesideExe(exe.replace(/\s+\(deleted\)$/, ''), fs, path)
      if (candidate) return candidate
    } catch {
      /* wine-preloader: exe is not the game binary */
    }

    for (const part of cmdline.split('\0')) {
      const unix = unixPathFromWineExe(part)
      if (!unix || !EXE_NAME_RE.test(unix)) continue
      const candidate = clientTxtBesideExe(unix, fs, path)
      if (candidate) return candidate
    }

    try {
      const cwd = fs.readlinkSync(`/proc/${pid}/cwd`)
      const candidate = path.join(cwd, 'logs', 'Client.txt')
      if (fs.existsSync(candidate)) return candidate
    } catch {
      /* no cwd */
    }
  }
  return null
}

function cmdlineIncludesPoeDir(cmdline: string): boolean {
  return /Path of Exile/i.test(cmdline)
}

/** Convert a PathOfExile*.exe path from a Wine/Proton cmdline into a Unix path. */
export function unixPathFromWineExe(raw: string): string | null {
  const trimmed = raw.trim().replace(/^"|"$/g, '')
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return trimmed
  // Proton maps Z: to the Unix root.
  const z = /^Z:([\\/].*)$/i.exec(trimmed)
  if (z) return z[1].replace(/\\/g, '/')
  if (!EXE_NAME_RE.test(trimmed)) return null
  return null
}

function extractExePath(command: string): string | null {
  const unix = command.match(/(\/\S*PathOfExile\S*)/i)
  if (unix) return unix[1]
  return unixPathFromWineExe(command.trim())
}

function resolveFromSteamLibraries(
  fs: PathResolverFs,
  roots: string[],
  version: GameVariant,
  path: PathApi,
): string | null {
  const libraries = new Set<string>()
  for (const root of roots) {
    if (fs.existsSync(path.join(root, 'steamapps'))) libraries.add(root)
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf')
    if (!fs.existsSync(vdf)) continue
    let text = ''
    try {
      text = fs.readFileSync(vdf, 'utf8')
    } catch {
      continue
    }
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.add(m[1].replace(/\\\\/g, '/'))
    }
  }

  // Only the attached game's install qualifies: a wrong-game Client.txt
  // would latch for the whole session (startClientLogWatcher never
  // re-resolves), which is worse than null - null retries on next attach.
  const name = STEAM_GAME_DIR[version]
  for (const lib of libraries) {
    const candidate = path.join(lib, 'steamapps', 'common', name, 'logs', 'Client.txt')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}
