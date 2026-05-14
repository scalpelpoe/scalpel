import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { pluginDir } from './paths'

const DEBOUNCE_MS = 100
const MAX_BYTES = 5 * 1024 * 1024 // 5MB serialized per plugin

type PluginData = Record<string, unknown>

const cache: Map<string, PluginData> = new Map()
const dirty: Set<string> = new Set()
const timers: Map<string, ReturnType<typeof setTimeout>> = new Map()

function storagePath(pluginId: string): string {
  return join(pluginDir(pluginId), 'storage.json')
}

function load(pluginId: string): PluginData {
  const existing = cache.get(pluginId)
  if (existing) return existing
  const p = storagePath(pluginId)
  let obj: PluginData = {}
  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'))
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) obj = raw as PluginData
    } catch {
      // corrupt JSON falls back to empty store
    }
  }
  cache.set(pluginId, obj)
  return obj
}

function flushOne(pluginId: string): void {
  if (!dirty.has(pluginId)) return
  // Clear the timer first so a throw from writeFileSync doesn't leak it.
  const t = timers.get(pluginId)
  if (t) {
    clearTimeout(t)
    timers.delete(pluginId)
  }
  const data = cache.get(pluginId) ?? {}
  const p = storagePath(pluginId)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(data))
  dirty.delete(pluginId)
}

function scheduleFlush(pluginId: string): void {
  dirty.add(pluginId)
  const existing = timers.get(pluginId)
  if (existing) clearTimeout(existing)
  timers.set(
    pluginId,
    setTimeout(() => {
      flushOne(pluginId)
    }, DEBOUNCE_MS),
  )
}

export function getValue(pluginId: string, key: string): unknown {
  const data = load(pluginId)
  return data[key] ?? null
}

export function setValue(pluginId: string, key: string, value: unknown): void {
  const data = load(pluginId)
  const next = { ...data, [key]: value }
  const size = JSON.stringify(next).length
  if (size > MAX_BYTES) {
    throw new Error(`plugin storage size exceeds 5MB cap (got ${size} bytes)`)
  }
  data[key] = value
  scheduleFlush(pluginId)
}

export function deleteValue(pluginId: string, key: string): void {
  const data = load(pluginId)
  if (!(key in data)) return
  delete data[key]
  scheduleFlush(pluginId)
}

export function listKeys(pluginId: string): string[] {
  return Object.keys(load(pluginId))
}

/** Force an immediate flush across all plugins. Called on app quit and in tests.
 *  Copies the dirty set first because flushOne mutates it during iteration. */
export function flushAll(): void {
  const ids = [...dirty]
  for (const id of ids) flushOne(id)
}

/** Drop a single plugin's in-memory state. Called on uninstall so a later
 *  reinstall with the same id doesn't get stale data flushed back to disk. */
export function clearCache(pluginId: string): void {
  const t = timers.get(pluginId)
  if (t) {
    clearTimeout(t)
    timers.delete(pluginId)
  }
  cache.delete(pluginId)
  dirty.delete(pluginId)
}

/** Reset all in-memory state. Test-only. */
export function _resetForTests(): void {
  for (const t of timers.values()) clearTimeout(t)
  cache.clear()
  dirty.clear()
  timers.clear()
}
