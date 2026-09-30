import { LIMITS, type StreamSnapshot, StreamSnapshotSchema } from './schema'

export type SnapshotValidation =
  | { ok: true; snapshot: StreamSnapshot; bytes: number }
  | { ok: false; reason: 'too-large' | 'too-many-items' | 'invalid'; issues: string[]; bytes: number }

export function countItems(snapshot: StreamSnapshot): number {
  const equipped = Object.values(snapshot.equipment).filter(Boolean).length
  return equipped + snapshot.flasks.length + snapshot.charms.length + snapshot.jewels.length + snapshot.other.length
}

/**
 * The single gate both Scalpel (before pushing) and the Worker (on receipt) run.
 * Accepts the raw JSON body or an already-parsed value; size is measured on the serialized form.
 */
export function validateSnapshot(input: unknown): SnapshotValidation {
  const json = typeof input === 'string' ? input : JSON.stringify(input)
  const bytes = new TextEncoder().encode(json).length
  if (bytes > LIMITS.snapshotBytes) {
    return { ok: false, reason: 'too-large', issues: [`snapshot is ${bytes} bytes; limit ${LIMITS.snapshotBytes}`], bytes }
  }

  let data: unknown = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return { ok: false, reason: 'invalid', issues: ['body is not valid JSON'], bytes }
    }
  }

  const parsed = StreamSnapshotSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    return { ok: false, reason: 'invalid', issues, bytes }
  }

  const items = countItems(parsed.data)
  if (items > LIMITS.items) {
    return { ok: false, reason: 'too-many-items', issues: [`${items} items; limit ${LIMITS.items}`], bytes }
  }

  return { ok: true, snapshot: parsed.data, bytes }
}
