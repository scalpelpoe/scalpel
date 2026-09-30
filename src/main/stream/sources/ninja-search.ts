import { asMessage, asString, decodeMessage, type WireField } from '../protobuf'

/** One character row from poe.ninja's streamer search. */
export interface StreamerCharacterRow {
  /** poe.ninja's account form: the discriminator joined with a dash ("name-1234"). */
  account: string
  name: string
  league: string | null
  level: number | null
  /** The Twitch login poe.ninja ties the character to, lowercased. */
  streamer: string
}

// Field numbers observed in the builds search response (captured 2026-09-29):
// the payload wraps one result message; the result carries one message per
// column, each with a string id and its values, row-aligned.
const RESULT = 1
const COLUMN = 12
const COLUMN_ID = 1
const COLUMN_INTS = 6
const COLUMN_STRINGS = 7

function packedVarints(bytes: Uint8Array): number[] {
  const out: number[] = []
  let value = 0
  let shift = 0
  for (const byte of bytes) {
    value += (byte & 0x7f) * 2 ** shift
    if (byte & 0x80) {
      shift += 7
    } else {
      out.push(value)
      value = 0
      shift = 0
    }
  }
  return out
}

function lengthDelimited(fields: WireField[], field: number): Uint8Array[] {
  const out: Uint8Array[] = []
  for (const f of fields) if (f.field === field && f.wire === 2) out.push(f.value)
  return out
}

/**
 * Decode the rows of a `search?streamer=<login>&overview=streamers` response.
 * poe.ninja orders them most-recently-seen first. A login poe.ninja doesn't list
 * gets every streamer's characters instead, so each row names its streamer.
 * Throws when the columns this depends on are missing, so callers can fall back
 * to a pinned character.
 */
export function parseStreamerSearch(bytes: Uint8Array): StreamerCharacterRow[] {
  const [result] = lengthDelimited(decodeMessage(bytes), RESULT)
  if (!result) throw new Error('poe.ninja search: no result message')

  const columns = new Map<string, WireField[]>()
  for (const raw of lengthDelimited(decodeMessage(result), COLUMN)) {
    const fields = asMessage(raw)
    if (!fields) continue
    const [idBytes] = lengthDelimited(fields, COLUMN_ID)
    const id = idBytes ? asString(idBytes) : null
    if (id && !columns.has(id)) columns.set(id, fields)
  }

  const strings = (id: string): string[] =>
    lengthDelimited(columns.get(id) ?? [], COLUMN_STRINGS).map((b) => asString(b) ?? '')
  const ints = (id: string): number[] => {
    const [packed] = lengthDelimited(columns.get(id) ?? [], COLUMN_INTS)
    return packed ? packedVarints(packed) : []
  }

  const names = strings('name')
  const accounts = strings('account')
  const streamers = strings('streamer.login')
  if (names.length === 0 || names.length !== accounts.length || names.length !== streamers.length) {
    throw new Error('poe.ninja search: name/account/streamer columns missing or misaligned')
  }
  const leagues = strings('league')
  const levels = ints('level')

  return names.map((name, i) => ({
    name,
    account: accounts[i],
    league: leagues[i] || null,
    level: levels.length === names.length ? levels[i] : null,
    streamer: streamers[i].toLowerCase(),
  }))
}
