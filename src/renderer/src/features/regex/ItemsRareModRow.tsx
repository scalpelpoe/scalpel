import type { ItemAffixRegex } from '@shared/data/regex/vendor/item/GeneratedItemMods'
import type { ItemsRareSelection } from '@shared/data/regex/items-state'

interface ItemsRareModRowProps {
  mod: ItemAffixRegex
  selection: ItemsRareSelection | undefined
  onToggle: () => void
  onValue: (index: number, value: string) => void
  alt: boolean
}

/** Upstream RareItemSelect's RareMod, restyled: the desc renders with number
 *  inputs inlined at the '#' positions listed in before/on/after, static
 *  min-max text at `disabled` positions, and the tier ladder when selected.
 *  Quirks kept: desc.replace('|', ' • ') replaces the FIRST pipe only; the
 *  whole row is input-less when the first affix name contains a decimal
 *  (upstream decimalRegex gate); typing into an input selects the row. */
const DECIMAL_REGEX = /\b\d+\.\d+\b/

export function ItemsRareModRow({ mod, selection, onToggle, onValue, alt }: ItemsRareModRowProps): JSX.Element {
  const selected = selection !== undefined
  const hasRange = mod.stats.some((s) => s.hasRange) && !DECIMAL_REGEX.test(mod.affixes[0]?.name ?? '')
  const segments = mod.desc.replace('|', ' • ').split('#')

  return (
    <div
      onClick={onToggle}
      className="px-3 py-[5px] text-[11px] cursor-pointer select-none"
      style={{
        background: selected ? 'rgba(122,162,247,0.15)' : alt ? 'rgba(255,255,255,0.02)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {!hasRange ? (
        <span>{mod.desc}</span>
      ) : (
        segments.map((seg, index) => {
          const range = mod.stats[index] ?? { min: '#', max: '#' }
          const takesInput = mod.before.includes(index) || mod.after.includes(index) || mod.on.includes(index)
          const isStatic = mod.disabled.includes(index)
          return (
            <span key={`${mod.desc}-${index}`}>
              <span>{seg}</span>
              {takesInput && (
                <input
                  type="number"
                  placeholder={`${range.min}-${range.max}`}
                  value={selection?.values[index] ?? ''}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onValue(index, e.target.value)}
                  className="w-14 mx-1 text-[10px] bg-black/40 rounded px-1 py-[1px] border-none"
                />
              )}
              {isStatic && <span className="text-text-dim mx-[2px]">{`${range.min}-${range.max}`}</span>}
            </span>
          )
        })
      )}
      {selected && mod.affixes.length > 0 && (
        <div className="mt-1 flex flex-col gap-[2px]" onClick={(e) => e.stopPropagation()}>
          {[...mod.affixes].reverse().map((a, i) => (
            <div key={a.name} className="text-[10px] text-text-dim">
              <span className="font-bold" style={{ color: 'var(--accent)' }}>
                T{i + 1}
              </span>{' '}
              {a.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
