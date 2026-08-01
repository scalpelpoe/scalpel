import { useEffect, useState } from 'react'
import type { CheatSheetCategory } from '@shared/types'
import { DEFINITIV_GUIDE_URL } from '@shared/endpoints'
import { m } from '@shared/paraglide/messages.js'
import { usePoeVersion } from '@renderer/shared/poe-version-context'

/** Lists the bundled starter packs (PREFAB_PACKS, scoped to the active PoE
 *  version) and lets the user import each one with one click. Renders null
 *  when nothing is available - either no packs at all, or all eligible packs
 *  have already been imported. */
export function PrefabPicker({
  importedSlugs,
  onImport,
}: {
  /** Slugs of categories already imported from a prefab. Buttons for these
   *  hide so the user can only have one copy of each pack at a time. */
  importedSlugs: Set<string>
  onImport: (cat: CheatSheetCategory) => void
}): JSX.Element | null {
  const [packs, setPacks] = useState<
    Array<{
      slug: string
      name: string
      imageCount: number
      poeVersion?: 1 | 2
      group?: 'leveling-complete' | 'leveling-simple'
    }>
  >([])
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const poeVersion = usePoeVersion()

  useEffect(() => {
    void window.api.listCheatSheetPrefabs().then(setPacks)
  }, [])

  // Show only packs that target this PoE version (or have no restriction)
  // AND haven't already been imported. When the user deletes their imported
  // pack category, the slug leaves importedSlugs and the button reappears.
  const visible = packs.filter(
    (p) => (p.poeVersion === undefined || p.poeVersion === poeVersion) && !importedSlugs.has(p.slug),
  )
  if (visible.length === 0) return null

  const handleImport = async (pack: { slug: string; name: string }): Promise<void> => {
    setImporting(pack.slug)
    setError(null)
    try {
      const result = await window.api.importCheatSheetPrefab(pack.slug)
      onImport({
        id: result.categoryId,
        name: pack.name,
        hotkey: '',
        sheets: result.sheets,
        prefabSlug: pack.slug,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(null)
    }
  }

  // Three picker sections driven by each pack's _group.txt sidecar.
  const sections = [
    { label: m.settings_cs_packs_leveling_complete(), packs: visible.filter((p) => p.group === 'leveling-complete') },
    { label: m.settings_cs_packs_leveling_simple(), packs: visible.filter((p) => p.group === 'leveling-simple') },
    { label: m.settings_cs_packs_other(), packs: visible.filter((p) => p.group === undefined) },
  ].filter((s) => s.packs.length > 0)

  return (
    <>
      {sections.map((s) => (
        <section key={s.label}>
          <label>{s.label}</label>
          <div className="mt-[6px] flex flex-wrap gap-2">
            {s.packs.map((p) => (
              <button
                key={p.slug}
                disabled={importing !== null}
                onClick={() => handleImport(p)}
                className="text-[11px] px-3 py-1.5 disabled:opacity-40 disabled:cursor-default"
              >
                {importing === p.slug ? `Importing ${p.name}...` : `+ ${p.name} (${p.imageCount})`}
              </button>
            ))}
          </div>
        </section>
      ))}
      {error && <div className="text-[10px] text-danger mt-1">{error}</div>}
      {visible.some((p) => p.slug.startsWith('poe1-act-')) && (
        <div className="text-[10px] text-text-dim mt-1">
          {m.settings_cs_poe1_pack_credit()}{' '}
          <button
            onClick={() => window.api.openExternal(DEFINITIV_GUIDE_URL)}
            className="underline bg-transparent border-0 p-0 text-text-dim cursor-pointer"
          >
            definitivguide.com
          </button>
        </div>
      )}
    </>
  )
}
