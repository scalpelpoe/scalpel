import { clipboard, screen } from 'electron'
import Store from 'electron-store'
import { getCurrentFilter } from './filter-state'
import { readItemFromClipboard } from './trade/clipboard'
import {
  findMatchingBlocks,
  findStackSizeBreakpoints,
  findQualityBreakpoints,
  findStrandBreakpoints,
  evaluateBlock,
} from './filter/matcher'
import { getOverlayWindow, showOverlay, setPanelSide } from './overlay'
import { sendCtrlCToActiveWindow, sendCtrlCViaKeyTap } from './hotkeys'
import { focusGameWindow } from './overlay'
import { refreshPrices, lookupPrice, lookupBestUniquePrice, getUniquesByBase } from './trade/prices'
import { ensureStatsLoaded, matchItemMods } from './trade/trade'
import type {
  AppSettings,
  FilterFile,
  MatchResult,
  OverlayData,
  PoeItem,
  TierGroup,
  TierSibling,
} from '../shared/types'

// ---- Tier group builder ----------------------------------------------------

export function buildTierGroup(filter: FilterFile, activeMatch: MatchResult, item: PoeItem): TierGroup | undefined {
  const tag = activeMatch.block.tierTag
  if (!tag) return undefined

  const siblings: TierSibling[] = []
  for (let i = 0; i < filter.blocks.length; i++) {
    const b = filter.blocks[i]
    if (b.tierTag && b.tierTag.typePath === tag.typePath) {
      const evaluation = evaluateBlock(b, item)
      siblings.push({
        tier: b.tierTag.tier,
        visibility: b.visibility,
        blockIndex: i,
        block: b,
        match: {
          block: b,
          blockIndex: i,
          isFirstMatch: i === activeMatch.blockIndex,
          evaluatedConditions: evaluation.evaluatedConditions,
          hasUnknowns: evaluation.hasUnknowns,
        },
      })
    }
  }

  if (siblings.length <= 1) return undefined

  // If siblings with this base type are differentiated only by threshold conditions
  // (StackSize, Quality, MemoryStrands), the slider handles navigation - hide the dropdown.
  // But if different tiers have different base type lists, that's normal tiering.
  const baseType = item.baseType
  const siblingsWithBaseType = siblings.filter((s) =>
    s.block.conditions.some((c) => c.type === 'BaseType' && c.values.includes(baseType)),
  )
  if (siblingsWithBaseType.length > 1) {
    // Check if these siblings have the same base type list (threshold-only differentiation)
    const thresholdTypes = new Set(['StackSize', 'Quality', 'MemoryStrands'])
    const allSameBaseTypes = siblingsWithBaseType.every((s) => {
      const btValues = s.block.conditions
        .filter((c) => c.type === 'BaseType')
        .flatMap((c) => c.values)
        .sort()
        .join(',')
      const firstBtValues = siblingsWithBaseType[0].block.conditions
        .filter((c) => c.type === 'BaseType')
        .flatMap((c) => c.values)
        .sort()
        .join(',')
      return btValues === firstBtValues
    })
    const differByThresholdOnly =
      allSameBaseTypes && siblingsWithBaseType.some((s) => s.block.conditions.some((c) => thresholdTypes.has(c.type)))
    if (differByThresholdOnly) return undefined
  }

  return { typePath: tag.typePath, siblings, currentTier: tag.tier }
}

// ---- Shared evaluation helper ----------------------------------------------

let lastCursorX: number | null = null

export function getLastCursorX(): number | null {
  return lastCursorX
}

export function evaluateAndSend(item: PoeItem): void {
  const currentFilter = getCurrentFilter()
  if (!currentFilter) return
  const matches = findMatchingBlocks(currentFilter, item)
  const isStackable =
    item.stackSize > 0 && currentFilter.blocks.some((b) => b.conditions.some((c) => c.type === 'StackSize'))
  const stackBreakpoints = isStackable ? findStackSizeBreakpoints(currentFilter, item) : undefined
  if (stackBreakpoints) {
    for (const bp of stackBreakpoints) {
      if (bp.activeMatch) {
        bp.tierGroup = buildTierGroup(currentFilter, bp.activeMatch, item)
      }
    }
  }
  // Strand breakpoints (computed first so quality can check if strands are shown)
  const hasStrandConditions = currentFilter.blocks.some((b) => b.conditions.some((c) => c.type === 'MemoryStrands'))
  const strandBreakpoints =
    hasStrandConditions && item.memoryStrands != null ? findStrandBreakpoints(currentFilter, item) : undefined
  const effectiveStrandBps = strandBreakpoints && strandBreakpoints.length > 1 ? strandBreakpoints : undefined
  if (effectiveStrandBps) {
    for (const bp of effectiveStrandBps) {
      if (bp.activeMatch) {
        bp.tierGroup = buildTierGroup(currentFilter, bp.activeMatch, item)
      }
    }
  }

  // Quality breakpoints - skip if strand breakpoints are already shown
  const hasQualityConditions = currentFilter.blocks.some((b) => b.conditions.some((c) => c.type === 'Quality'))
  const qualityBreakpoints =
    hasQualityConditions && !effectiveStrandBps ? findQualityBreakpoints(currentFilter, item) : undefined
  const effectiveQualityBps = qualityBreakpoints && qualityBreakpoints.length > 1 ? qualityBreakpoints : undefined
  if (effectiveQualityBps) {
    for (const bp of effectiveQualityBps) {
      if (bp.activeMatch) {
        bp.tierGroup = buildTierGroup(currentFilter, bp.activeMatch, item)
      }
    }
  }
  const activeMatch = matches.find((m) => m.isFirstMatch)
  const tierGroup = activeMatch ? buildTierGroup(currentFilter, activeMatch, item) : undefined
  const priceInfo = lookupPrice(item.name, item.baseType)
  const payload: OverlayData = {
    item,
    matches,
    stackBreakpoints,
    qualityBreakpoints: effectiveQualityBps,
    strandBreakpoints: effectiveStrandBps,
    tierGroup,
    priceInfo,
  }
  const win = getOverlayWindow()
  if (win) {
    win.webContents.send(
      'cursor-side',
      lastCursorX != null && lastCursorX < screen.getPrimaryDisplay().workAreaSize.width / 2 ? 'left' : 'right',
    )
    win.webContents.send('overlay-data', payload)
  }
}

// ---- Preload price check ---------------------------------------------------

export async function preloadPriceCheck(item: PoeItem, store: Store<AppSettings>): Promise<void> {
  const league = store.get('league')
  await refreshPrices(league)
  const priceInfo =
    item.rarity === 'Unique'
      ? (lookupBestUniquePrice(item.baseType) ?? lookupPrice(item.name, item.baseType))
      : lookupPrice(item.name, item.baseType)

  // For unidentified uniques, find all possible uniques for this base type
  const unidCandidates: Array<{ name: string; chaosValue: number }> = []
  if (item.rarity === 'Unique' && !item.identified) {
    const uniquesByBase = getUniquesByBase()
    let names = uniquesByBase[item.baseType] ?? []
    // Unique maps all share "Map" base type
    if (item.itemClass === 'Maps' && names.length === 0) {
      names = uniquesByBase['Map'] ?? []
    }
    const isStandard = league.toLowerCase() === 'standard'
    for (const name of names) {
      // Look up by name only - base type fallback would return the base's price, not the unique's
      const price = lookupPrice(name, name)
      // In non-Standard leagues, skip items with no price (not obtainable this league)
      if (!isStandard && !price) continue
      unidCandidates.push({ name, chaosValue: price?.chaosValue ?? 0 })
    }
    unidCandidates.sort((a, b) => b.chaosValue - a.chaosValue)
  }

  await ensureStatsLoaded()
  const statFilters = matchItemMods(
    item.explicits,
    item.implicits,
    {
      armour: item.armour,
      evasion: item.evasion,
      energyShield: item.energyShield,
      ward: item.ward,
      block: item.block,
    },
    {
      sockets: item.sockets,
      linkedSockets: item.linkedSockets,
      quality: item.quality,
      itemLevel: item.itemLevel,
      baseType: item.baseType,
      rarity: item.rarity,
      itemClass: item.itemClass,
      gemLevel: item.gemLevel,
      corrupted: item.corrupted,
      mirrored: item.mirrored,
      identified: item.identified,
      influence: item.influence,
      mapQuantity: item.mapQuantity,
      mapRarity: item.mapRarity,
      mapPackSize: item.mapPackSize,
      mapMoreScarabs: item.mapMoreScarabs,
      mapMoreCurrency: item.mapMoreCurrency,
      mapMoreMaps: item.mapMoreMaps,
      mapMoreDivCards: item.mapMoreDivCards,
      enchants: item.enchants,
      imbues: item.imbues,
      memoryStrands: item.memoryStrands,
      physDamageMin: item.physDamageMin,
      physDamageMax: item.physDamageMax,
      eleDamageAvg: item.eleDamageAvg,
      chaosDamageAvg: item.chaosDamageAvg,
      attacksPerSecond: item.attacksPerSecond,
      monsterLevel: item.monsterLevel,
      wingsRevealed: item.wingsRevealed,
      wingsTotal: item.wingsTotal,
      mapReward: item.mapReward,
      transfigured: item.transfigured,
      logbookFactions: item.logbookFactions,
      logbookBosses: item.logbookBosses,
    },
    item.advancedMods,
    store.get('priceCheckDefaultPercent') ?? 90,
  )

  const divinePrice = lookupPrice('Divine Orb', 'Divine Orb')
  const chaosPerDivine = divinePrice?.chaosValue ?? 0
  getOverlayWindow()?.webContents.send('price-check', {
    item,
    priceInfo,
    statFilters,
    league,
    chaosPerDivine,
    unidCandidates: unidCandidates.length > 0 ? unidCandidates : undefined,
  })
}

// ---- Hotkey handlers -------------------------------------------------------

let hotkeyProcessing = false
let consecutiveClipboardFailures = 0

export function createHotkeyHandler(store: Store<AppSettings>, isElevated: () => boolean): () => Promise<void> {
  return async function onHotkeyFired(): Promise<void> {
    if (hotkeyProcessing) return
    hotkeyProcessing = true

    try {
      // Capture cursor position before anything else - determines stash vs inventory
      lastCursorX = screen.getCursorScreenPoint().x

      const currentFilter = getCurrentFilter()
      if (!currentFilter) {
        getOverlayWindow()?.webContents.send('no-filter-loaded')
        showOverlay()
        return
      }

      // Clear clipboard, send Ctrl+C to PoE, then poll until clipboard changes
      clipboard.clear()
      await sendCtrlCToActiveWindow()

      // Poll for clipboard content
      let item: PoeItem | null = null
      for (let i = 0; i < 3; i++) {
        item = readItemFromClipboard()
        if (item) break
        await new Promise((r) => setTimeout(r, 50))
      }

      // Fallback for windowed mode where VBScript SendKeys can't reach PoE
      if (!item) {
        clipboard.clear()
        focusGameWindow()
        await new Promise((r) => setTimeout(r, 50))
        await sendCtrlCViaKeyTap()
        for (let i = 0; i < 10; i++) {
          item = readItemFromClipboard()
          if (item) break
          await new Promise((r) => setTimeout(r, 50))
        }
      }

      if (!item) {
        consecutiveClipboardFailures++
        // After 3 consecutive failures, hint that elevation might be the issue
        if (consecutiveClipboardFailures >= 3 && !isElevated()) {
          getOverlayWindow()?.webContents.send('elevation-hint')
        }
        getOverlayWindow()?.webContents.send('no-item-in-clipboard')
        showOverlay()
        return
      }

      consecutiveClipboardFailures = 0 // Reset on success

      const side =
        lastCursorX != null && lastCursorX < screen.getPrimaryDisplay().workAreaSize.width / 2 ? 'left' : 'right'
      setPanelSide(side)

      evaluateAndSend(item)
      // Preload price check data so it's ready if user switches tab
      preloadPriceCheck(item, store)
      showOverlay()
    } catch (err) {
      console.error('[hotkey] Error during hotkey processing:', err)
    } finally {
      hotkeyProcessing = false
    }
  }
}

export function createPriceCheckHandler(store: Store<AppSettings>, isElevated: () => boolean): () => Promise<void> {
  return async function onPriceCheckFired(): Promise<void> {
    if (hotkeyProcessing) return
    hotkeyProcessing = true

    try {
      lastCursorX = screen.getCursorScreenPoint().x
      const side = lastCursorX < screen.getPrimaryDisplay().workAreaSize.width / 2 ? 'left' : 'right'
      setPanelSide(side)

      clipboard.clear()
      await sendCtrlCToActiveWindow()

      let item: PoeItem | null = null
      for (let i = 0; i < 3; i++) {
        item = readItemFromClipboard()
        if (item) break
        await new Promise((r) => setTimeout(r, 50))
      }

      if (!item) {
        clipboard.clear()
        focusGameWindow()
        await new Promise((r) => setTimeout(r, 50))
        await sendCtrlCViaKeyTap()
        for (let i = 0; i < 10; i++) {
          item = readItemFromClipboard()
          if (item) break
          await new Promise((r) => setTimeout(r, 50))
        }
      }

      if (!item) {
        consecutiveClipboardFailures++
        if (consecutiveClipboardFailures >= 3 && !isElevated()) {
          getOverlayWindow()?.webContents.send('elevation-hint')
        }
        getOverlayWindow()?.webContents.send('no-item-in-clipboard')
        showOverlay()
        return
      }

      consecutiveClipboardFailures = 0

      // Send price check data, open the tab, and show overlay
      getOverlayWindow()?.webContents.send('price-check-open')
      await preloadPriceCheck(item, store)
      showOverlay()
      // Evaluate filter in background so item tab is ready when user switches to it
      if (getCurrentFilter()) evaluateAndSend(item)
    } catch (err) {
      console.error('[hotkey] Error during price check processing:', err)
    } finally {
      hotkeyProcessing = false
    }
  }
}
