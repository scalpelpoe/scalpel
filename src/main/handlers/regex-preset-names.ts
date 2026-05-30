import type { RegexPreset } from '../../shared/types'

/** Backfill `name` from legacy `tags` (joined by spaces) for any preset that
 *  lacks one. Pure + idempotent: returns the (possibly new) array and whether
 *  anything changed so the caller can decide to persist. */
export function backfillPresetNames(presets: RegexPreset[]): { presets: RegexPreset[]; changed: boolean } {
  let changed = false
  const out = presets.map((p) => {
    if (p.name) return p
    const derived = (p.tags ?? [])
      .map((t) => t.text)
      .join(' ')
      .trim()
    if (!derived) return p
    changed = true
    return { ...p, name: derived }
  })
  return { presets: out, changed }
}
