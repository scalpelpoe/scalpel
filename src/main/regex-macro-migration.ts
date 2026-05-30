import type Store from 'electron-store'
import type { AppSettings, RegexPreset } from '../shared/types'

type AppMacro = AppSettings['appMacros'][number]

function findByTag(presets: RegexPreset[], tag: string): RegexPreset | undefined {
  return presets.find((p) => (p.tags ?? []).some((t) => t.text === tag && (!t.source || t.source === 'custom')))
}

/** Convert legacy `useSavedRegex` macros that bind by `tag` into `presetId`
 *  bindings, resolving against both game slots. Pure + idempotent. */
export function migrateAppMacros(
  macros: AppMacro[],
  presetsPoe1: RegexPreset[],
  presetsPoe2: RegexPreset[],
): { macros: AppMacro[]; changed: boolean } {
  let changed = false
  const out = macros.map((m) => {
    if (m.action !== 'useSavedRegex' || m.presetId || !m.tag) return m
    const preset = findByTag(presetsPoe1, m.tag) ?? findByTag(presetsPoe2, m.tag)
    if (!preset) return m
    changed = true
    const { tag: _drop, ...rest } = m
    return { ...rest, presetId: preset.id }
  })
  return { macros: out, changed }
}

const MIGRATION_FLAG = 'regexMacroBindingMigrationDone'

/** Run the appMacros tag->presetId migration once. Guarded by a store flag so
 *  it is a no-op on every subsequent launch. Must run before renderers read. */
export function runRegexMacroMigration(store: Store<AppSettings>): void {
  if ((store.get(MIGRATION_FLAG as keyof AppSettings) as unknown) === true) return
  const macros = (store.get('appMacros') as AppMacro[]) ?? []
  const { macros: migrated, changed } = migrateAppMacros(
    macros,
    (store.get('regexPresetsPoe1') as RegexPreset[]) ?? [],
    (store.get('regexPresetsPoe2') as RegexPreset[]) ?? [],
  )
  if (changed) store.set('appMacros', migrated)
  store.set(MIGRATION_FLAG as keyof AppSettings, true as never)
}
