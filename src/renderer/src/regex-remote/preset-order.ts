import type { RegexPreset } from '@shared/types'

/** Generator key a preset belongs to. Legacy presets predate the field and are
 *  all Maps presets, matching RegexRemote's grouping. */
export function generatorOf(preset: RegexPreset): string {
  return preset.generator ?? 'maps'
}

/** Splice a group's new order back into the full preset list, expressed as ids.
 *
 *  The remote pad shows presets grouped by generator, so a drag only ever
 *  reorders one group. The reorder IPC, though, rewrites the whole store from
 *  the ids it is handed - anything omitted is dropped. So the group's members
 *  are written back into the index slots they already occupied, leaving every
 *  other preset (and the relative position of the groups) untouched.
 *
 *  Defensive against a partial `orderedIds`: ids that aren't in this group are
 *  ignored, duplicates collapse, and any group member the caller left out is
 *  appended in its existing order. The result is always a permutation of the
 *  input ids, so no preset can be lost to a malformed drag payload. */
export function applyGroupOrder(all: RegexPreset[], generatorKey: string, orderedIds: string[]): string[] {
  const groupIds = all.filter((p) => generatorOf(p) === generatorKey).map((p) => p.id)
  const inGroup = new Set(groupIds)
  const taken = new Set<string>()
  const queue: string[] = []
  for (const id of orderedIds) {
    if (!inGroup.has(id) || taken.has(id)) continue
    taken.add(id)
    queue.push(id)
  }
  for (const id of groupIds) if (!taken.has(id)) queue.push(id)
  let next = 0
  return all.map((p) => (generatorOf(p) === generatorKey ? queue[next++] : p.id))
}
