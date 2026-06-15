import { useEffect, useState } from 'react'
import type { CheatSheetCategory } from '@shared/types'
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
  const [packs, setPacks] = useState<Array<{ slug: string; name: string; imageCount: number; poeVersion?: 1 | 2 }>>([])
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

  return (
    <section>
      <label>Starter packs</label>
      <div className="mt-[6px] flex flex-wrap gap-2">
        {visible.map((p) => (
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
      {error && <div className="text-[10px] text-danger mt-1">{error}</div>}
    </section>
  )
}
