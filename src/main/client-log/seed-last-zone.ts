import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { parseClientLogLine } from './parse-client-log'
import type { Zone } from '@shared/types'

const MAX_SCAN_BYTES = 2_000_000

/** PoE appends this marker on every client boot. A zone line before the
 *  last marker belongs to a previous session and must never seed "current". */
const SESSION_BOUNDARY = 'LOG FILE OPENING'

export interface SeedLastZoneFs {
  statSync(path: string): { size: number }
  openSync(path: string, flags: string): number
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number
  closeSync(fd: number): void
}

const defaultFs: SeedLastZoneFs = { statSync, openSync, readSync, closeSync }

/** Walk a Client.txt chunk from the end and return the most recent parsed
 *  zone line. Used so the tracker has a zone immediately instead of waiting
 *  for the next area transition. */
export function parseLastZoneFromChunk(text: string): Zone | null {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(SESSION_BOUNDARY)) return null
    const parsed = parseClientLogLine(lines[i])
    if (parsed) return parsed
  }
  return null
}

/** Read the tail of Client.txt and return the last Generating-level zone. */
export function readLastZoneFromLog(path: string, fs: SeedLastZoneFs = defaultFs): Zone | null {
  let fd: number | null = null
  try {
    const size = fs.statSync(path).size
    if (size <= 0) return null
    const bytesToRead = Math.min(size, MAX_SCAN_BYTES)
    const position = size - bytesToRead
    const buf = Buffer.alloc(bytesToRead)
    fd = fs.openSync(path, 'r')
    fs.readSync(fd, buf, 0, bytesToRead, position)
    let text = buf.toString('utf8')
    // If we started mid-file, drop the likely-truncated first line.
    if (position > 0) {
      const nl = text.indexOf('\n')
      if (nl >= 0) text = text.slice(nl + 1)
    }
    return parseLastZoneFromChunk(text)
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        /* ignore */
      }
    }
  }
}
