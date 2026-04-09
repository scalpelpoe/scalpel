import type { FilterCondition } from '../../../../shared/types'
import { ItemChip } from '../ItemChip'

export function ConditionRow({ cond, itemClass }: { cond: FilterCondition; itemClass: string }): JSX.Element {
  const numericTypes = new Set([
    'ItemLevel',
    'AreaLevel',
    'DropLevel',
    'Quality',
    'Sockets',
    'LinkedSockets',
    'GemLevel',
    'StackSize',
    'WaystoneTier',
    'BaseArmour',
    'BaseEvasion',
    'BaseEnergyShield',
    'BaseWard',
  ])
  const showOp = numericTypes.has(cond.type) && cond.operator !== '='
  const isBaseType = cond.type === 'BaseType'

  return (
    <div className="flex gap-[6px] flex-wrap">
      <span className="min-w-[130px]" style={{ color: '#7ec8e3' }}>
        {cond.type}
      </span>
      {showOp && <span className="text-accent">{cond.operator}</span>}
      {isBaseType ? (
        <span className="flex gap-[6px] flex-wrap">
          {cond.values.map((v, i) => (
            <ItemChip
              key={i}
              name={v}
              itemClass={itemClass}
              onClick={() => window.api.lookupBaseType(v, itemClass)}
              title={`Switch to ${v}`}
            />
          ))}
        </span>
      ) : (
        <span style={{ color: '#f0c27f' }}>{cond.values.join(' ')}</span>
      )}
    </div>
  )
}
