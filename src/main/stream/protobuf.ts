/** Minimal protobuf wire-format reader. poe.ninja's builds search answers in
 *  protobuf with no published schema, so rather than vendor a generated codec we
 *  walk the wire format and pick out the fields we need by number. Only the
 *  wire types that appear in practice are supported (varint, 64-bit,
 *  length-delimited, 32-bit); anything else throws. */

export type WireField =
  | { field: number; wire: 0; value: bigint }
  | { field: number; wire: 1; value: Uint8Array }
  | { field: number; wire: 2; value: Uint8Array }
  | { field: number; wire: 5; value: Uint8Array }

function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n
  let shift = 0n
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new Error('protobuf: truncated varint')
    const byte = buf[pos++]
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return [result, pos]
    shift += 7n
  }
  throw new Error('protobuf: varint too long')
}

/** Decode one message level into its fields, in wire order. */
export function decodeMessage(buf: Uint8Array): WireField[] {
  const fields: WireField[] = []
  let pos = 0
  while (pos < buf.length) {
    const [key, afterKey] = readVarint(buf, pos)
    pos = afterKey
    const field = Number(key >> 3n)
    const wire = Number(key & 7n)
    if (field === 0) throw new Error('protobuf: field number 0')
    if (wire === 0) {
      const [value, next] = readVarint(buf, pos)
      fields.push({ field, wire, value })
      pos = next
    } else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4
      if (pos + size > buf.length) throw new Error('protobuf: truncated fixed field')
      fields.push({ field, wire, value: buf.subarray(pos, pos + size) })
      pos += size
    } else if (wire === 2) {
      const [len, next] = readVarint(buf, pos)
      const end = next + Number(len)
      if (end > buf.length) throw new Error('protobuf: truncated length-delimited field')
      fields.push({ field, wire, value: buf.subarray(next, end) })
      pos = end
    } else {
      throw new Error(`protobuf: unsupported wire type ${wire}`)
    }
  }
  return fields
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Interpret a length-delimited field as UTF-8, or null when it isn't valid text. */
export function asString(value: Uint8Array): string | null {
  try {
    return utf8.decode(value)
  } catch {
    return null
  }
}

/** Interpret a length-delimited field as a nested message, or null when the bytes don't parse as one. */
export function asMessage(value: Uint8Array): WireField[] | null {
  try {
    return decodeMessage(value)
  } catch {
    return null
  }
}
