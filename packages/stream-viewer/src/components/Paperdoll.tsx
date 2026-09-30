import type { Slot, SnapshotItem, StreamSnapshot } from '@scalpel/stream-contract'
import { type CSSProperties, useState } from 'react'
import { ItemSlot } from './ItemSlot'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

type DollPosition = 'Weapon' | 'Offhand' | 'Helm' | 'Amulet' | 'BodyArmour' | 'Ring' | 'Ring2' | 'Ring3' | 'Gloves' | 'Belt' | 'Boots'

/** PoE2 inventory arrangement on an 8 x 6 grid, in grid steps (--ssv-cell). */
const LAYOUT: Record<DollPosition, Box> = {
  Weapon: { x: 0, y: 0, w: 2, h: 4 },
  Helm: { x: 3, y: 0, w: 2, h: 2 },
  Offhand: { x: 6, y: 0, w: 2, h: 4 },
  Ring3: { x: 2, y: 2, w: 1, h: 1 },
  BodyArmour: { x: 3, y: 2, w: 2, h: 3 },
  Amulet: { x: 5, y: 2, w: 1, h: 1 },
  Ring: { x: 2, y: 3, w: 1, h: 1 },
  Ring2: { x: 5, y: 3, w: 1, h: 1 },
  Gloves: { x: 1, y: 4, w: 2, h: 2 },
  Belt: { x: 3, y: 5, w: 2, h: 1 },
  Boots: { x: 5, y: 4, w: 2, h: 2 },
}

const LABELS: Record<DollPosition, string> = {
  Weapon: 'Main hand',
  Offhand: 'Off hand',
  Helm: 'Helmet',
  Amulet: 'Amulet',
  Ring3: 'Ring',
  BodyArmour: 'Body armour',
  Ring: 'Left ring',
  Ring2: 'Right ring',
  Gloves: 'Gloves',
  Belt: 'Belt',
  Boots: 'Boots',
}

const steps = (n: number): string => `calc(var(--ssv-cell) * ${n})`
/** A tile n steps long, less one gutter, so neighbouring tiles keep an even gap. */
const span = (n: number): string => `calc(var(--ssv-cell) * ${n} - var(--ssv-gap))`

function boxStyle(box: Box): CSSProperties {
  return { left: steps(box.x), top: steps(box.y), width: span(box.w), height: span(box.h) }
}

const isManaFlask = (item: SnapshotItem): boolean => item.baseType.endsWith('Mana Flask')

interface Props {
  snapshot: StreamSnapshot
  selected: SnapshotItem | null
  onHover: (item: SnapshotItem | null) => void
  onPin: (item: SnapshotItem) => void
}

/** Equipped gear in PoE2's inventory arrangement, both weapon sets, and the flask belt. */
export function Paperdoll({ snapshot, selected, onHover, onPin }: Props): JSX.Element {
  const [weaponSet, setWeaponSet] = useState<1 | 2>(snapshot.character.activeWeaponSet)
  const { equipment } = snapshot
  const patched = new Set<Slot>(snapshot.patches.map((p) => p.slot))
  const hasSet2 = !!(equipment.Weapon2 || equipment.Offhand2)

  const slotFor = (pos: DollPosition): Slot => {
    if (weaponSet === 2 && pos === 'Weapon') return 'Weapon2'
    if (weaponSet === 2 && pos === 'Offhand') return 'Offhand2'
    return pos
  }

  const positions = (Object.keys(LAYOUT) as DollPosition[]).filter((pos) => pos !== 'Ring3' || equipment.Ring3)
  // As in game: life flask on the left, charms in the middle, mana flask on the right.
  const belt = [
    ...snapshot.flasks.filter((f) => !isManaFlask(f)).map((item) => ({ item, label: 'Flask' })),
    ...snapshot.charms.map((item) => ({ item, label: 'Charm' })),
    ...snapshot.flasks.filter(isManaFlask).map((item) => ({ item, label: 'Flask' })),
  ]

  return (
    <div className="ssv-doll-wrap">
      <div className="ssv-doll">
        {hasSet2 && (
          <div className="ssv-set-toggle" role="group" aria-label="Weapon set">
            {([1, 2] as const).map((set) => (
              <button
                key={set}
                type="button"
                aria-pressed={weaponSet === set}
                // !bg-accent: Scalpel's base button[aria-pressed] rule would otherwise win on specificity.
                className={`px-0 py-1 text-[10px] leading-none ${weaponSet === set ? '!bg-accent text-bg-solid' : 'text-text-dim'}`}
                onClick={() => setWeaponSet(set)}
              >
                {set === 1 ? 'I' : 'II'}
              </button>
            ))}
          </div>
        )}
        {positions.map((pos) => {
          const slot = slotFor(pos)
          const item = equipment[slot]
          return (
            <ItemSlot
              key={pos}
              item={item}
              label={LABELS[pos]}
              style={boxStyle(LAYOUT[pos])}
              active={!!item && item === selected}
              patched={patched.has(slot)}
              onHover={onHover}
              onPin={onPin}
            />
          )
        })}
      </div>
      {belt.length > 0 && (
        <div className="ssv-belt">
          {belt.map(({ item, label }, i) => (
            <ItemSlot
              key={i}
              item={item}
              label={label}
              active={item === selected}
              onHover={onHover}
              onPin={onPin}
            />
          ))}
        </div>
      )}
    </div>
  )
}
