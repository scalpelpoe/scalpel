import { ReactSortable } from 'react-sortablejs'
import type { CheatSheetCategory, ProfileSettingValue, RuntimeSettings } from '../../../../shared/types'
import { HotkeyField } from './HotkeyField'
import { generateClientCategoryId } from './utils'
import type { HotkeySlot } from './hotkey-collisions'
import { CategoryCard } from './cheatsheets/CategoryCard'
import { PrefabPicker } from './cheatsheets/PrefabPicker'

interface Props {
  settings: RuntimeSettings
  updateProfile: <K extends 'cheatSheets'>(key: K, value: ProfileSettingValue<K>) => Promise<void>
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
  /** Shows a banner error message via the parent SettingsPanel. Called for
   *  URL-paste failures and other transient operations the user should know
   *  about but that shouldn't block the form. */
  onError: (message: string, tone?: 'error' | 'warn') => void
}

export function CheatSheetsTab({ settings, updateProfile, tryHotkey, onError }: Props): JSX.Element {
  const cheatSheets = settings.activeProfile?.cheatSheets ?? { globalHotkey: '', categories: [] }
  const setCategories = (categories: CheatSheetCategory[]): void => {
    updateProfile('cheatSheets', { ...cheatSheets, categories })
  }

  return (
    <>
      <div className="settings-section-title mt-3">Cheat Sheets</div>

      {/* Global hotkey */}
      <section>
        <label>Cheat Sheet Hotkey</label>
        <div className="mt-[6px]">
          <HotkeyField
            value={cheatSheets.globalHotkey}
            onChange={(hotkey) => {
              if (!tryHotkey(hotkey, { kind: 'cheatsheet-global' })) return
              updateProfile('cheatSheets', { ...cheatSheets, globalHotkey: hotkey })
            }}
          />
        </div>
      </section>

      {/* Starter packs - shown only when at least one bundled pack hasn't yet
          been imported into the user's categories for this game. Each pack
          downloads a fixed set of images on click and creates a category
          stamped with the pack's slug. */}
      <PrefabPicker
        importedSlugs={new Set(cheatSheets.categories.map((c) => c.prefabSlug).filter((s): s is string => !!s))}
        onImport={(cat) => {
          setCategories([...cheatSheets.categories, cat])
        }}
      />

      {/* Categories */}
      {cheatSheets.categories.length === 0 ? (
        <CategoriesEmptyState onAdd={() => setCategories([newCategory()])} />
      ) : (
        <section>
          <label>Categories</label>
          <div className="mt-[6px]">
            <ReactSortable
              list={cheatSheets.categories.map((c) => ({ ...c }))}
              setList={setCategories}
              animation={150}
              // Restrict drag to the explicit grip icon so text selection in
              // the name input and other interactions stay normal.
              handle=".category-grab"
              className="flex flex-col gap-2"
            >
              {cheatSheets.categories.map((cat, i) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  index={i}
                  tryHotkey={tryHotkey}
                  onError={onError}
                  onUpdate={(next) => {
                    const arr = [...cheatSheets.categories]
                    arr[i] = next
                    setCategories(arr)
                  }}
                  onRemove={() => {
                    void window.api.removeCheatSheetCategory(cat.id)
                    setCategories(cheatSheets.categories.filter((_, j) => j !== i))
                  }}
                />
              ))}
            </ReactSortable>
            <button
              onClick={() => setCategories([...cheatSheets.categories, newCategory()])}
              className="text-[11px] text-text-dim self-start px-3 py-1.5 mt-2"
            >
              + Add Category
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function newCategory(): CheatSheetCategory {
  return { id: generateClientCategoryId(), name: 'New Category', hotkey: '', sheets: [] }
}

function CategoriesEmptyState({ onAdd }: { onAdd: () => void }): JSX.Element {
  return (
    <section>
      <div className="bg-black/15 rounded p-3 flex flex-col items-center gap-1">
        <button onClick={onAdd} className="text-[11px] px-3 py-1.5">
          + Add Category
        </button>
        <div className="text-[10px] text-text-dim">
          Categories group cheat sheets and can be hotkeyed independently.
        </div>
      </div>
    </section>
  )
}
