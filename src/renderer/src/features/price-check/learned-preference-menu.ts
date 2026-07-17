import { isLearnable } from '@shared/learning'

/** Mid-session pin/unpin actions. The session-start `learnedDecisions` map is
 *  static, so local actions must shadow it for menu-entry derivation. */
export type SessionPref = 'set' | 'unset'

export function hasLearnedPreference(
  id: string,
  decisions: Record<string, boolean>,
  sessionPrefs: Record<string, SessionPref>,
): boolean {
  const local = sessionPrefs[id]
  if (local) return local === 'set'
  return id in decisions
}

export interface LearnedMenuEntry {
  kind: 'set' | 'unset'
  label: string
}

/** Set is always offered (it re-pins the row's CURRENT state, so "learned on,
 *  toggled off, pin that" is one action); Unset only when a preference exists. */
export function learnedMenuEntries(
  f: { id: string; type: string },
  decisions: Record<string, boolean>,
  sessionPrefs: Record<string, SessionPref>,
): LearnedMenuEntry[] {
  if (!isLearnable(f)) return []
  const entries: LearnedMenuEntry[] = [{ kind: 'set', label: 'Set as Learned Preference' }]
  if (hasLearnedPreference(f.id, decisions, sessionPrefs)) {
    entries.push({ kind: 'unset', label: 'Unset Learned Preference' })
  }
  return entries
}
