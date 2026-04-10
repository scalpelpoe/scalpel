import { ipcMain } from 'electron'
import Store from 'electron-store'
import { getCurrentFilter } from '../filter-state'
import { evaluateAndSend } from '../evaluation'
import {
  refreshPrices,
  lookupPrice,
  lookupBestUniquePrice,
  lookupDivCardPrice,
  getUniquesByBase,
} from '../trade/prices'
import type { AppSettings, PoeItem } from '../../shared/types'

export function register(_store: Store<AppSettings>): void {
  ipcMain.handle(
    'lookup-base-type',
    (_event, baseType: string, itemClass: string, rarity?: string, uniqueName?: string) => {
      const currentFilter = getCurrentFilter()
      if (!currentFilter) return

      // If base type or class is missing for a unique, try reverse lookup from uniques-by-base
      // and search the filter for a block containing that base type
      if (currentFilter && uniqueName && (!itemClass || !baseType || baseType === uniqueName)) {
        // Build reverse map: unique name -> base type
        const uniqueBase = getUniquesByBase()
        let foundBase = baseType
        for (const [base, names] of Object.entries(uniqueBase)) {
          if (names.includes(uniqueName)) {
            foundBase = base
            break
          }
        }
        if (foundBase && foundBase !== uniqueName) baseType = foundBase
        // Find class from filter block containing this base type
        if (!itemClass && currentFilter) {
          for (const block of currentFilter.blocks) {
            const btCond = block.conditions.find((c) => c.type === 'BaseType' && c.values.includes(baseType))
            if (btCond) {
              const classCond = block.conditions.find((c) => c.type === 'Class')
              if (classCond && classCond.values.length > 0) itemClass = classCond.values[0]
              break
            }
          }
        }
      }

      const syntheticItem: PoeItem = {
        itemClass,
        rarity: (rarity as PoeItem['rarity']) || 'Normal',
        name: uniqueName || baseType,
        baseType,
        mapTier: 0,
        itemLevel: 100,
        quality: 0,
        sockets: '',
        linkedSockets: 0,
        armour: 0,
        evasion: 0,
        energyShield: 0,
        ward: 0,
        block: 0,
        reqStr: 0,
        reqDex: 0,
        reqInt: 0,
        corrupted: false,
        identified: true,
        mirrored: false,
        synthesised: false,
        fractured: false,
        blighted: false,
        scourged: false,
        zanaMemory: false,
        implicitCount: 0,
        gemLevel: 0,
        stackSize: 1,
        influence: [],
        explicits: [],
        implicits: [],
        areaLevel: 83,
      }
      evaluateAndSend(syntheticItem)
    },
  )

  ipcMain.handle(
    'batch-lookup-prices',
    async (
      _event,
      baseTypes: string[],
      league: string,
      uniqueTier?: boolean,
    ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> => {
      await refreshPrices(league)
      const result: Record<string, { chaosValue: number; divineValue?: number } | null> = {}
      for (const bt of baseTypes) {
        result[bt] = (uniqueTier ? lookupBestUniquePrice(bt) : undefined) ?? lookupPrice(bt, bt) ?? null
      }
      return result
    },
  )

  ipcMain.handle(
    'batch-lookup-div-card-prices',
    async (
      _event,
      cardNames: string[],
      league: string,
    ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> => {
      await refreshPrices(league)
      const result: Record<string, { chaosValue: number; divineValue?: number } | null> = {}
      for (const name of cardNames) {
        result[name] = lookupDivCardPrice(name) ?? null
      }
      return result
    },
  )

  ipcMain.handle(
    'get-div-card-tiers',
    (): {
      tierStyles: Record<string, { border: string; bg: string; text: string }>
      cardTiers: Record<string, string>
      hiddenCards: Record<string, boolean>
    } => {
      const currentFilter = getCurrentFilter()
      if (!currentFilter) return { tierStyles: {}, cardTiers: {}, hiddenCards: {} }
      const tierStyles: Record<string, { border: string; bg: string; text: string }> = {}
      const cardTiers: Record<string, string> = {}
      const hiddenCards: Record<string, boolean> = {}
      for (const block of currentFilter.blocks) {
        if (!block.tierTag || block.tierTag.typePath !== 'divination') continue
        const tier = block.tierTag.tier
        const isHidden = block.visibility === 'Hide'
        const toRgba = (a: { values: string[] }): string => {
          const [r, g, b, alpha] = a.values.map(Number)
          return `rgba(${r ?? 0},${g ?? 0},${b ?? 0},${(alpha ?? 255) / 255})`
        }
        const border = block.actions.find((a) => a.type === 'SetBorderColor')
        const bg = block.actions.find((a) => a.type === 'SetBackgroundColor')
        const text = block.actions.find((a) => a.type === 'SetTextColor')
        tierStyles[tier] = {
          border: border ? toRgba(border) : 'transparent',
          bg: bg ? toRgba(bg) : 'transparent',
          text: text ? toRgba(text) : '#fff',
        }
        for (const cond of block.conditions) {
          if (cond.type === 'BaseType') {
            for (const v of cond.values) {
              cardTiers[v] = tier
              if (isHidden) hiddenCards[v] = true
            }
          }
        }
      }
      return { tierStyles, cardTiers, hiddenCards }
    },
  )
}
