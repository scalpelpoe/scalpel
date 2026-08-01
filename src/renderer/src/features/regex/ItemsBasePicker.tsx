import { useState } from 'react'
import { CloseSmall } from '@icon-park/react'
import { searchItemBases, searchItemClasses, type ItemsBaseRef, type ItemsRarity } from '@shared/data/regex/items-state'

interface ItemsBasePickerProps {
  rarity: ItemsRarity
  itembase: ItemsBaseRef | null
  onPick: (base: ItemsBaseRef) => void
  onClear: () => void
}

/** Class-first base selector. Rare mode searches the 39 item classes (rare mods
 *  key on the class alone - poe.re makes you pick a specific item, we don't);
 *  Magic mode searches the full item list because the item name is part of the
 *  output. Plain input + dropdown list, no external autocomplete dependency. */
export function ItemsBasePicker({ rarity, itembase, onPick, onClear }: ItemsBasePickerProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const rows: ItemsBaseRef[] =
    rarity === 'Rare' ? searchItemClasses(query).map((c) => ({ baseType: c, item: '' })) : searchItemBases(query)

  const pick = (row: ItemsBaseRef): void => {
    onPick(row)
    setQuery('')
    setOpen(false)
  }

  const selectedLabel =
    itembase === null
      ? null
      : rarity === 'Magic' && itembase.item
        ? `${itembase.item} (${itembase.baseType})`
        : itembase.baseType

  if (selectedLabel !== null) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 px-2 py-[4px] rounded text-[11px] font-semibold"
          style={{ background: 'var(--accent)', color: '#171821' }}
        >
          {selectedLabel}
          <span onClick={onClear} className="flex items-center cursor-pointer opacity-70 hover:opacity-100">
            <CloseSmall size={12} theme="outline" fill="currentColor" />
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={rarity === 'Rare' ? 'Search item class...' : 'Search for item...'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && rows.length > 0) pick(rows[0])
          if (e.key === 'Escape') setOpen(false)
        }}
        className="w-full text-[11px] bg-black/30 rounded px-2 py-[5px] border-none"
      />
      {open && rows.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-20 rounded overflow-y-auto"
          style={{ maxHeight: 220, background: 'var(--bg-solid)', border: '1px solid var(--border)' }}
        >
          {rows.map((row) => (
            <div
              key={`${row.baseType}|${row.item}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(row)
              }}
              className="px-2 py-[4px] text-[11px] cursor-pointer hover:bg-white/10"
            >
              {row.item ? (
                <span>
                  {row.item} <span className="text-text-dim">- {row.baseType}</span>
                </span>
              ) : (
                row.baseType
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
