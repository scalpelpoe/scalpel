import { requireCalculator, requireData } from './crystalline'
import { drawnNodes, getAffectedNodes, skillTree, translateStat } from './tree/skill-tree'
import type { TimelessTreeState } from './state'

export type AggregatedStat = {
  statId: number
  label: string
  count: number
  nodeIds: number[]
}

export type RadiusStatGroups = {
  notables: AggregatedStat[]
  smalls: AggregatedStat[]
  /** Per-node rows (transformed or with additions). */
  nodes: Array<{ skillId: number; name: string; isNotable: boolean; stats: string[] }>
}

function emptyGroups(): RadiusStatGroups {
  return { notables: [], smalls: [], nodes: [] }
}

/** Aggregate transformed stats in the jewel radius — same Notables/Smalls split as Vilsol. */
export function aggregateRadiusStats(state: TimelessTreeState): RadiusStatGroups {
  if (!state.socketSkillId || !state.seed || !state.conqueror) return emptyGroups()
  const socket = drawnNodes[state.socketSkillId]
  if (!socket) return emptyGroups()

  const calc = requireCalculator()
  const data = requireData()
  const affected = getAffectedNodes(socket).filter((n) => !n.isJewelSocket && !n.isMastery && n.skill)

  const notableMap = new Map<number, number[]>()
  const smallMap = new Map<number, number[]>()
  const nodes: RadiusStatGroups['nodes'] = []

  for (const node of affected) {
    const skillId = node.skill!
    const treeNode = skillTree.nodes[String(skillId)] ?? skillTree.nodes[skillId]
    if (treeNode?.isKeystone) continue

    const passive = data.TreeToPassive[skillId]
    if (!passive) continue

    const result = calc.Calculate(passive.Index, state.seed, state.jewelType, state.conqueror)
    if (!result) continue

    const isNotable = Boolean(treeNode?.isNotable || node.isNotable)
    const target = isNotable ? notableMap : smallMap
    const nodeStatLabels: string[] = []

    const pushStat = (statId: number, roll?: number) => {
      const list = target.get(statId) ?? []
      list.push(skillId)
      target.set(statId, list)
      nodeStatLabels.push(translateStat(statId, roll))
    }

    const alt = result.AlternatePassiveSkill
    if (alt?.StatsKeys) {
      alt.StatsKeys.forEach((statId, i) => pushStat(statId, result.StatRolls?.[i]))
    }
    result.AlternatePassiveAdditionInformations?.forEach((info) => {
      info.AlternatePassiveAddition?.StatsKeys?.forEach((statId, i) => {
        pushStat(statId, info.StatRolls?.[i])
      })
    })

    if (nodeStatLabels.length === 0) continue
    nodes.push({
      skillId,
      name: alt?.Name || node.name || treeNode?.name || `Node ${skillId}`,
      isNotable,
      stats: nodeStatLabels,
    })
  }

  const toSorted = (map: Map<number, number[]>): AggregatedStat[] =>
    [...map.entries()]
      .map(([statId, nodeIds]) => ({
        statId,
        label: translateStat(statId),
        count: nodeIds.length,
        nodeIds,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return {
    notables: toSorted(notableMap),
    smalls: toSorted(smallMap),
    nodes: nodes.sort((a, b) => Number(b.isNotable) - Number(a.isNotable) || a.name.localeCompare(b.name)),
  }
}
