import type { SLOTS, SnapshotItem, StreamSnapshot } from '@scalpel/stream-contract'
import { useState } from 'react'
import { CardOrPriceCheck, type CheckableItem } from './CardOrPriceCheck'

type SlotName = (typeof SLOTS)[number]

/** Display order and labels for the list views (Twitch panel, OBS compact). */
const ROWS: Array<[SlotName, string]> = [
  ['Weapon', 'Main hand'],
  ['Offhand', 'Off hand'],
  ['Weapon2', 'Swap main hand'],
  ['Offhand2', 'Swap off hand'],
  ['Helm', 'Helmet'],
  ['BodyArmour', 'Body armour'],
  ['Gloves', 'Gloves'],
  ['Boots', 'Boots'],
  ['Belt', 'Belt'],
  ['Amulet', 'Amulet'],
  ['Ring', 'Left ring'],
  ['Ring2', 'Right ring'],
  ['Ring3', 'Ring'],
]

export function equippedRows(snapshot: StreamSnapshot): Array<{ label: string; item: SnapshotItem }> {
  const rows: Array<{ label: string; item: SnapshotItem }> = []
  for (const [slot, label] of ROWS) {
    const item = snapshot.equipment[slot]
    if (item) rows.push({ label, item })
  }
  return rows
}

/** Equipped items as a list; tapping a row opens its card inline. `interactive`
 *  is false for the OBS view, which only shows names. */
export function CompactGear({ snapshot, interactive = true }: { snapshot: StreamSnapshot; interactive?: boolean }): JSX.Element {
  const [open, setOpen] = useState<SnapshotItem | null>(null)
  const [checking, setChecking] = useState<CheckableItem | null>(null)
  return (
    <div className="flex flex-col gap-0.5">
      {equippedRows(snapshot).map(({ label, item }) => (
        <div key={label}>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-1.5 py-1 text-left bg-transparent hover:bg-bg-hover aria-expanded:bg-bg-hover"
            aria-expanded={open === item}
            disabled={!interactive}
            onClick={() => {
              setChecking(null)
              setOpen((cur) => (cur === item ? null : item))
            }}
          >
            <img className="w-[26px] h-[26px] shrink-0 object-contain" src={item.icon} alt="" />
            <span className="min-w-0">
              <div className={`font-bold truncate ssv-r-${item.rarity}`}>{item.name ?? item.baseType}</div>
              <div className="text-[10px] text-text-dim">
                {label}
                {item.name && item.rarity !== 'magic' ? ` · ${item.baseType}` : ''}
              </div>
            </span>
          </button>
          {interactive && open === item && (
            <div className="ssv-inline-tooltip" style={{ marginTop: 4 }}>
              <CardOrPriceCheck item={item} checking={checking} canCheck onCheck={setChecking} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
