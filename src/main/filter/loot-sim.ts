import type { FilterBlock, FilterFile } from '@shared/types'
import type { LootSimAlert, LootSimDrop, LootSimRequest, LootSimResult } from '@shared/contracts/loot-sim'
import { defaultPoeItem } from '@shared/poe-item'
import { findMatchingBlocks } from './matcher'

export type { LootSimAlert, LootSimDrop, LootSimRequest, LootSimResult }

/** Effective alert sound from a Continue chain (later writer wins). */
export function extractAlertFromChain(blocks: FilterBlock[]): LootSimAlert {
  let alert: LootSimAlert = { kind: 'none' }
  for (const block of blocks) {
    for (const action of block.actions) {
      if (action.type === 'PlayAlertSound' || action.type === 'PlayAlertSoundPositional') {
        if (action.values.length === 0) {
          alert = { kind: 'none' }
        } else {
          alert = { kind: 'builtin', value: action.values[0], volume: action.values[1] ?? '300' }
        }
      } else if (action.type === 'CustomAlertSound' || action.type === 'CustomAlertSoundOptional') {
        if (action.values.length === 0) {
          alert = { kind: 'none' }
        } else {
          alert = { kind: 'custom', value: action.values[0], volume: action.values[1] ?? '300' }
        }
      }
    }
  }
  return alert
}

function resolveMatchChain(filter: FilterFile, item: PoeItem): FilterBlock[] {
  const matches = findMatchingBlocks(filter, item)
  if (matches.length === 0) return []
  const primaryIdx = matches.findIndex((m) => m.isFirstMatch)
  const chain = primaryIdx >= 0 ? matches.slice(0, primaryIdx + 1) : matches
  return chain.map((m) => m.block)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Simulate N ground drops from a pool against the active filter. */
export function simulateLootDrops(filter: FilterFile, req: LootSimRequest, poeVersion: 1 | 2): LootSimResult {
  const pool = req.pool.filter((p) => p.baseType.trim())
  if (pool.length === 0 || req.count <= 0) return { drops: [], shown: 0, hidden: 0 }

  const rand = mulberry32(req.seed ?? Date.now())
  const drops: LootSimDrop[] = []
  let shown = 0
  let hidden = 0

  for (let i = 0; i < req.count; i++) {
    const pick = pool[Math.floor(rand() * pool.length)]
    const rarity =
      pick.rarity === 'Unique' || pick.rarity === 'Gem' || pick.rarity === 'Currency' ? pick.rarity : 'Normal'
    const item = defaultPoeItem(
      {
        baseType: pick.baseType,
        name: pick.name || pick.baseType,
        itemClass: pick.itemClass || 'Stackable Currency',
        rarity,
        itemLevel: req.areaLevel,
      },
      poeVersion,
    )
    const chain = resolveMatchChain(filter, item)
    const primary = [...chain].reverse().find((b) => !b.continue) ?? chain[chain.length - 1]
    const isHidden = !primary || primary.visibility === 'Hide'
    if (isHidden) hidden++
    else shown++

    drops.push({
      id: `drop-${i}-${pick.baseType}`,
      name: pick.name || pick.baseType,
      baseType: pick.baseType,
      itemClass: pick.itemClass,
      hidden: isHidden,
      blocks: chain.length
        ? chain.map((b) => ({
            visibility: b.visibility,
            actions: b.actions,
            continue: b.continue,
          }))
        : null,
      alert: chain.length ? extractAlertFromChain(chain) : { kind: 'none' },
      x: 8 + rand() * 84,
      y: 10 + rand() * 75,
    })
  }

  return { drops, shown, hidden }
}
