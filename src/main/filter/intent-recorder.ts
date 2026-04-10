import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createHash } from 'crypto'
import type { Intent, IntentLog } from './intents'

let currentFilterPath: string | null = null
let currentLog: IntentLog = { filterName: '', intents: [] }

function getIntentsDir(): string {
  const dir = join(app.getPath('userData'), 'intents')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function filterHash(filterPath: string): string {
  return createHash('md5').update(filterPath).digest('hex')
}

function getIntentFilePath(filterPath: string): string {
  return join(getIntentsDir(), `${filterHash(filterPath)}.json`)
}

export function loadIntents(filterPath: string, filterName: string): void {
  currentFilterPath = filterPath
  const filePath = getIntentFilePath(filterPath)
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'))
      currentLog = data as IntentLog
    } catch {
      currentLog = { filterName, intents: [] }
    }
  } else {
    currentLog = { filterName, intents: [] }
  }
}

export function getIntents(): IntentLog {
  return currentLog
}

export function record(intent: Intent): void {
  currentLog.intents.push(intent)
  compact()
  persist()
}

export function clearIntents(): void {
  currentLog.intents = []
  persist()
}

export function hasIntentLog(filterPath: string): boolean {
  return existsSync(getIntentFilePath(filterPath))
}

function persist(): void {
  if (!currentFilterPath) return
  const filePath = getIntentFilePath(currentFilterPath)
  writeFileSync(filePath, JSON.stringify(currentLog, null, 2), 'utf-8')
}

function compact(): void {
  const intents = currentLog.intents
  const compacted: Intent[] = []

  // Process in timestamp order
  const sorted = [...intents].sort((a, b) => a.timestamp - b.timestamp)

  for (const intent of sorted) {
    if (intent.type === 'move-basetype') {
      const p = intent.payload as import('./intents').MoveBaseTypePayload
      // Remove any prior move-basetype for the same value that targets a different tier
      const priorIdx = compacted.findIndex(
        (i) => i.type === 'move-basetype' && (i.payload as import('./intents').MoveBaseTypePayload).value === p.value,
      )
      if (priorIdx !== -1) {
        const prior = compacted[priorIdx]
        const priorPayload = prior.payload as import('./intents').MoveBaseTypePayload
        // If the new destination is the original source, the moves cancel out
        if (intent.target.tier === priorPayload.fromTier && intent.target.typePath === prior.target.typePath) {
          compacted.splice(priorIdx, 1)
          continue
        }
        // Otherwise collapse: keep original fromTier, update destination
        compacted.splice(priorIdx, 1)
        compacted.push({
          ...intent,
          payload: { value: p.value, fromTier: priorPayload.fromTier },
        })
        continue
      }
      compacted.push(intent)
    } else if (intent.type === 'set-visibility') {
      // Same target: keep latest
      const key = `${intent.target.typePath}/${intent.target.tier}`
      const priorIdx = compacted.findIndex(
        (i) => i.type === 'set-visibility' && `${i.target.typePath}/${i.target.tier}` === key,
      )
      if (priorIdx !== -1) compacted.splice(priorIdx, 1)
      compacted.push(intent)
    } else if (intent.type === 'set-threshold') {
      const p = intent.payload as import('./intents').SetThresholdPayload
      const key = `${intent.target.typePath}/${intent.target.tier}/${p.condition}`
      const priorIdx = compacted.findIndex((i) => {
        if (i.type !== 'set-threshold') return false
        const ip = i.payload as import('./intents').SetThresholdPayload
        return `${i.target.typePath}/${i.target.tier}/${ip.condition}` === key
      })
      if (priorIdx !== -1) compacted.splice(priorIdx, 1)
      compacted.push(intent)
    } else if (intent.type === 'set-action') {
      const p = intent.payload as import('./intents').SetActionPayload
      const key = `${intent.target.typePath}/${intent.target.tier}/${p.action}`
      const priorIdx = compacted.findIndex((i) => {
        if (i.type !== 'set-action') return false
        const ip = i.payload as import('./intents').SetActionPayload
        return `${i.target.typePath}/${i.target.tier}/${ip.action}` === key
      })
      if (priorIdx !== -1) compacted.splice(priorIdx, 1)
      compacted.push(intent)
    }
  }

  currentLog.intents = compacted
}
