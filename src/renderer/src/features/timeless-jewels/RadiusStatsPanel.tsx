import type { AggregatedStat, RadiusStatGroups } from './aggregate-radius-stats'

function StatRows({ title, rows }: { title: string; rows: AggregatedStat[] }): JSX.Element | null {
  if (rows.length === 0) return null
  return (
    <div className="mb-3">
      <h3 className="text-[12px] font-semibold text-text mb-1">{title}</h3>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.statId} className="text-[11px] leading-snug flex gap-1.5">
            <span className="text-accent shrink-0 tabular-nums">({r.count})</span>
            <span className="text-[#8cf34c]">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RadiusStatsPanel({
  groups,
  emptyHint,
  compact,
}: {
  groups: RadiusStatGroups
  emptyHint?: string
  compact?: boolean
}): JSX.Element {
  const empty = groups.notables.length === 0 && groups.smalls.length === 0
  return (
    <div className={`overflow-auto ${compact ? 'p-2' : 'p-3'} h-full`}>
      {empty ? (
        <div className="text-[11px] text-text-dim leading-snug">
          {emptyHint ?? 'Select a jewel socket to list transformed stats in radius.'}
        </div>
      ) : (
        <>
          <StatRows title="Notables" rows={groups.notables} />
          <StatRows title="Smalls" rows={groups.smalls} />
        </>
      )}
    </div>
  )
}
