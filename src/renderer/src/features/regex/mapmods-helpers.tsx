import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { AddOne, Forbid, CheckOne } from '@icon-park/react'
import type { RegexPresetTag } from '@shared/types'
import { usePoeVersion } from '../../shared/poe-version-context'

/** Shared palette for the regex-tool UI. Keyed by semantic role so every tab / list /
 *  tag that wants "the avoid color" resolves to the same hex, re-themeable from one
 *  place. Sub-components import only the keys they use. */
export const TAB_COLORS = {
  qualifiers: '#81c784',
  avoid: '#ef5350',
  want: '#81c784',
  nightmare: '#b71c1c',
  custom: '#90a4ae',
} as const

/** The custom checkbox visual shared across the regex tool's tabs: a small rounded
 *  square that fills with the given color and shows a check when on. Keeps the
 *  Qualifiers toggles visually identical to the Want/Avoid mod rows instead of
 *  rendering a native HTML checkbox that looks like a different component. */
export function RegexCheckbox({ checked, color }: { checked: boolean; color: string }): JSX.Element {
  return (
    <div
      className="w-[14px] h-[14px] shrink-0 rounded-[3px] flex items-center justify-center transition-[background] duration-100"
      style={{ background: checked ? color : 'rgba(255,255,255,0.1)' }}
    >
      {checked && <span className="text-[10px] text-[#171821] font-bold leading-none">&#10003;</span>}
    </div>
  )
}

/** Thin vertical divider rendered between two adjacent inactive tabs in a tab
 *  strip. An active tab already reads as its own block, so a separator next to one
 *  is redundant; this only clarifies the boundary where two low-contrast inactive
 *  tabs would otherwise run together. Used as a flex child between tab buttons.
 *
 *  `inset` (default true) pads the line off the top/bottom -- right for strips
 *  whose inactive tabs are transparent (the inset blends into them). Pass
 *  `inset={false}` for strips whose tabs have a filled background, where an inset
 *  would expose the darker container bg above/below the line and read as a notch. */
export function TabSeparator({ inset = true }: { inset?: boolean }): JSX.Element {
  return (
    <div
      aria-hidden
      style={{
        flex: '0 0 1px',
        alignSelf: 'stretch',
        margin: inset ? '6px 0' : 0,
        background: 'rgba(255,255,255,0.09)',
      }}
    />
  )
}

/** Canonical display formatter for mod-row text:
 *  - Collapses roll-range numbers to `#` so two rolls of the same mod compare equal.
 *  - Splits multi-line vendor mods (joined with `|` in the source data) onto a single
 *    visual line with " - " separators. PoE1 map mods don't use `|`, so this is a
 *    no-op for them; PoE2 waystone mods use `|` to glue the multi-stat rows. */
export function formatModText(text: string): string {
  return text
    .replace(/\d+[-to ]*\d*%/g, '#%')
    .replace(/\d+[-to ]*\d+/g, '#')
    .replace(/\|/g, ' - ')
}

/** Read a JSON value from localStorage with a fallback + optional custom parser. The
 *  custom parser is useful for string-valued keys that shouldn't be JSON.parse'd. */
export function loadStorage<T>(key: string, fallback: T, parse: (s: string) => T = JSON.parse): T {
  try {
    const saved = localStorage.getItem(key)
    return saved != null ? parse(saved) : fallback
  } catch {
    return fallback
  }
}

/** Read an array value from localStorage and rehydrate it as a Set. Defaults to
 *  numeric ids (used by maps) but generic so flask state can rehydrate string sets. */
export function loadSet<T = number>(key: string): Set<T> {
  return new Set(loadStorage<T[]>(key, []))
}

/** ── Persisted-state hooks ─────────────────────────────────────────────────
 *  Thin wrappers around `useState` that auto-load from localStorage on mount and
 *  auto-write on change. They collapse the ubiquitous `useState(loadStorage(...))
 *  + useEffect(setItem(...))` pair into a single call. Each variant matches the
 *  stored format used by existing call sites:
 *    - `usePersistedString` -- raw string (no JSON quotes)
 *    - `usePersistedNumber` -- `String(n)` form, parsed via `parseInt`
 *    - `usePersistedBool`   -- `"true"` / `"false"` literal
 *    - `usePersistedJSON`   -- arbitrary JSON for objects/arrays
 *    - `usePersistedSet`    -- JSON array, rehydrated as `Set` */

function usePersistedStorage<T>(
  storageKey: string,
  initLazy: () => T,
  serialize: (v: T) => string,
): [T, Dispatch<SetStateAction<T>>] {
  // useState's lazy-initializer form runs once on mount, so the localStorage
  // read happens exactly when needed -- not on every render.
  const [value, setValue] = useState<T>(initLazy)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, serialize(value))
    } catch {
      /* quota / disabled -- just drop the write */
    }
    // `serialize` is intentionally omitted from deps: it's a closure each call
    // site supplies fresh on every render, so including it would re-run the
    // effect on every render. The current closure is always used at write time.
  }, [storageKey, value])
  return [value, setValue]
}

export function usePersistedString<T extends string = string>(
  storageKey: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  return usePersistedStorage<T>(
    storageKey,
    () => loadStorage(storageKey, defaultValue, (s) => s as T),
    (v) => v,
  )
}

export function usePersistedNumber(
  storageKey: string,
  defaultValue: number,
): [number, Dispatch<SetStateAction<number>>] {
  return usePersistedStorage<number>(
    storageKey,
    () =>
      loadStorage(storageKey, defaultValue, (s) => {
        // Round-trip via parseInt with an explicit NaN guard so a stored `"0"`
        // rehydrates to 0 rather than getting silently snapped to `defaultValue`.
        // The earlier `parseInt(s) || defaultValue` shape relied on 0-being-falsy,
        // which loses the legitimate value.
        const n = parseInt(s, 10)
        return Number.isNaN(n) ? defaultValue : n
      }),
    String,
  )
}

export function usePersistedBool(
  storageKey: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  return usePersistedStorage<boolean>(
    storageKey,
    () => loadStorage(storageKey, defaultValue, (s) => s === 'true'),
    String,
  )
}

export function usePersistedJSON<T>(storageKey: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  return usePersistedStorage<T>(storageKey, () => loadStorage(storageKey, defaultValue), JSON.stringify)
}

export function usePersistedSet<T = number>(storageKey: string): [Set<T>, Dispatch<SetStateAction<Set<T>>>] {
  return usePersistedStorage<Set<T>>(
    storageKey,
    () => loadSet<T>(storageKey),
    (v) => JSON.stringify([...v]),
  )
}

/** Hook returning a key-builder for regex-tool localStorage entries. Namespaces
 *  every key by the active game version so PoE1 and PoE2 working state (selected
 *  mods, active tab, custom regex, etc.) are isolated. Use as
 *  `loadStorage(key('map-avoid'), [])` instead of the bare 'scalpel:regex:map-avoid'. */
export function useRegexKey(): (suffix: string) => string {
  const v = usePoeVersion()
  return useCallback((suffix: string) => `scalpel:regex:poe${v}:${suffix}`, [v])
}

/** One-shot migration of legacy unsuffixed regex-tool localStorage keys into the
 *  PoE1 namespace. Pre-namespacing, the regex tool was PoE1-only, so legacy data
 *  is implicitly PoE1. Idempotent (skipped if already done) and safe to call from
 *  multiple component mounts. Run inside RegexGenerator before any reads. */
let legacyRegexKeysMigrated = false
export function ensureLegacyRegexKeysMigrated(): void {
  if (legacyRegexKeysMigrated) return
  legacyRegexKeysMigrated = true
  if (typeof localStorage === 'undefined') return
  // Snapshot keys first -- removeItem during iteration shifts indices.
  const candidates: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith('scalpel:regex:')) continue
    const suffix = k.slice('scalpel:regex:'.length)
    if (suffix.startsWith('poe1:') || suffix.startsWith('poe2:')) continue
    candidates.push(k)
  }
  for (const legacy of candidates) {
    const suffix = legacy.slice('scalpel:regex:'.length)
    const target = `scalpel:regex:poe1:${suffix}`
    if (localStorage.getItem(target) != null) {
      // Already migrated by a previous run; just discard the legacy copy.
      localStorage.removeItem(legacy)
      continue
    }
    const value = localStorage.getItem(legacy)
    if (value != null) {
      localStorage.setItem(target, value)
      localStorage.removeItem(legacy)
    }
  }
}

const CUSTOM_TAG_TEXT = '#E40000'

/** Inline styles for a preset-tag chip. Custom-source tags render as a white pill with
 *  a red border/text; other sources paint the chip using the tag's own color. */
export function tagChipStyle(tag: RegexPresetTag): React.CSSProperties {
  const isCustom = !tag.source || tag.source === 'custom'
  return {
    background: isCustom ? '#fff' : `${tag.color}cc`,
    color: isCustom ? CUSTOM_TAG_TEXT : '#fff',
    border: isCustom ? `1px solid ${CUSTOM_TAG_TEXT}` : undefined,
    borderRadius: 2,
    textShadow: isCustom ? undefined : '0 1px 2px rgba(0,0,0,0.4)',
  }
}

/** Icon for a preset tag source type (qualifier / avoid / want). */
export function TagSourceIcon({ source, size = 12 }: { source?: string; size?: number }): JSX.Element | null {
  const fill: [string, string] = ['currentColor', 'rgba(255,255,255,0.2)']
  const style = { marginTop: size > 10 ? 1 : 0, marginLeft: size > 10 ? -2 : -1 }
  if (source === 'qualifier') return <AddOne size={size} theme="two-tone" fill={fill} style={style} />
  if (source === 'avoid') return <Forbid size={size} theme="two-tone" fill={fill} style={style} />
  if (source === 'want') return <CheckOne size={size} theme="two-tone" fill={fill} style={style} />
  return null
}
