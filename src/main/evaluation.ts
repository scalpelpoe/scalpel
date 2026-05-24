import { clipboard, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import type Store from 'electron-store'
import { isTownOrHideout } from '../shared/is-town-or-hideout'
import type {
  AppSettings,
  FilterFile,
  MatchResult,
  OverlayData,
  PoeItem,
  TierGroup,
  TierSibling,
} from '../shared/types'
import { getCurrentZone } from './client-log'
import { snapshotClipboard } from './clipboard-preserve'
import {
  evaluateBlock,
  findMatchingBlocks,
  findQualityBreakpoints,
  findStackSizeBreakpoints,
  findStrandBreakpoints,
} from './filter/matcher'
import { getCurrentFilter } from './filter-state'
import { detectFocusedPoeVersion } from './game-detector'
import { getPoeVersion } from './game-state'
import { requestGameSwitch } from './game-switch'
import { sendCtrlCToPoE } from './hotkeys'
import { focusGameWindow, getOverlayWindow, isTypingInOverlay, showOverlay } from './overlay'
import { readItemFromClipboard } from './trade/clipboard'
import {
  getUniquesByBase,
  lookupBestUniquePrice,
  lookupPrice,
  lookupPriceForItem,
  lookupUniquePriceForBase,
  refreshPrices,
} from './trade/prices'
import { ensureStatsLoaded, matchItemMods } from './trade/trade'

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

let openSide: AppSettings['openSide'] = 'both'

export function setOpenSide(side: AppSettings['openSide']): void {
  openSide = side
}

let lastEvaluatedItem: PoeItem | null = null
let storeRef: Store<AppSettings> | null = null

/** Lets the IPC layer pass the Store handle into this module so the
 *  override helper can read the `useCurrentZoneAreaLevel` flag without
 *  importing the store directly. Called once at boot. */
export function setEvaluationStore(s: Store<AppSettings>): void {
  storeRef = s
}

function applyZoneAreaLevel(item: PoeItem): PoeItem {
  if (!storeRef?.get('useCurrentZoneAreaLevel')) return item
  const zone = getCurrentZone()
  if (!zone) return item
  if (isTownOrHideout(zone.areaCode, getPoeVersion())) return item
  return { ...item, areaLevel: zone.areaLevel }
}

/** Re-run evaluation on the most recently displayed item. Called when the
 *  user toggles the zone-level override so the panel updates without a
 *  fresh hotkey press. No-op when no item has been evaluated yet. */
export function reEvaluateLastItem(): void {
  if (lastEvaluatedItem) evaluateAndSend(lastEvaluatedItem)
}

export function evaluateAndSend(item: PoeItem): void {
  lastEvaluatedItem = item
  const effective = applyZoneAreaLevel(item)
  const currentFilter = getCurrentFilter()
  if (!currentFilter) return
  const matches = findMatchingBlocks(currentFilter, effective)
  const isStackable =
    effective.stackSize > 0 && currentFilter.blocks.some((b) => b.conditions.some((c) => c.type === 'StackSize'))
  const stackBreakpoints = isStackable ? findStackSizeBreakpoints(currentFilter, effective) : undefined
  if (stackBreakpoints) {
    for (const bp of stackBreakpoints) {
      if (bp.activeMatch) {
        bp.tierGroup = buildTierGroup(currentFilter, bp.activeMatch, effective)
      }
    }
  }
  // Strand breakpoints (computed first so quality can check if strands are shown)
  const hasStrandConditions = currentFilter.blocks.some((b) => b.conditions.some((c) => c.type === 'MemoryStrands'))
  const strandBreakpoints =
    hasStrandConditions && effective.memoryStrands != null ? findStrandBreakpoints(currentFilter, effective) : undefined
  const effectiveStrandBps = strandBreakpoints && strandBreakpoints.length > 1 ? strandBreakpoints : undefined
  if (effectiveStrandBps) {
    for (const bp of effectiveStrandBps) {
      if (bp.activeMatch) {
        bp.tierGroup = buildTierGroup(currentFilter, bp.activeMatch, effective)
      }
    }
  }

  // Quality breakpoints - skip if strand breakpoints are already shown
  const hasQualityConditions = currentFilter.blocks.some((b) => b.conditions.some((c) => c.type === 'Quality'))
  const qualityBreakpoints =
    hasQualityConditions && !effectiveStrandBps ? findQualityBreakpoints(currentFilter, effective) : undefined
  const effectiveQualityBps = qualityBreakpoints && qualityBreakpoints.length > 1 ? qualityBreakpoints : undefined
  if (effectiveQualityBps) {
    for (const bp of effectiveQualityBps) {
      if (bp.activeMatch) {
        bp.tierGroup = buildTierGroup(currentFilter, bp.activeMatch, effective)
      }
    }
  }
  const activeMatch = matches.find((m) => m.isFirstMatch)
  const tierGroup = activeMatch ? buildTierGroup(currentFilter, activeMatch, effective) : undefined
  const priceInfo = lookupPriceForItem(effective)
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
    const side: 'left' | 'right' =
      openSide === 'left'
        ? 'left'
        : openSide === 'right'
          ? 'right'
          : lastCursorX != null && lastCursorX < screen.getPrimaryDisplay().workAreaSize.width / 2
            ? 'left'
            : 'right'
    win.webContents.send('cursor-side', side)
    win.webContents.send('overlay-data', payload)
  }
}

// ---- Preload price check ---------------------------------------------------

export async function preloadPriceCheck(item: PoeItem, store: Store<AppSettings>): Promise<void> {
  const league = store.get('league')
  await refreshPrices(league)
  const priceInfo =
    item.rarity === 'Unique'
      ? (lookupBestUniquePrice(item.baseType) ?? lookupPriceForItem(item))
      : lookupPriceForItem(item)

  // For unidentified uniques, find all possible uniques for this base type
  const unidCandidates: Array<{ name: string; chaosValue: number }> = []
  if (item.rarity === 'Unique' && !item.identified) {
    const uniquesByBase = getUniquesByBase()
    let names = uniquesByBase[item.baseType] ?? []
    // Unique maps all share "Map" base type
    if (item.itemClass === 'Maps' && names.length === 0) {
      names = uniquesByBase.Map ?? []
    }
    const isStandard = league.toLowerCase() === 'standard'
    for (const name of names) {
      // Disambiguate same-name uniques by the item's base type; falls back
      // to the name-only entry when no variant key matches.
      const price = lookupUniquePriceForBase(name, item.baseType)
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
      critChance: item.critChance,
      heistJob: item.heistJob,
      monsterLevel: item.monsterLevel,
      wingsRevealed: item.wingsRevealed,
      wingsTotal: item.wingsTotal,
      mapReward: item.mapReward,
      transfigured: item.transfigured,
      synthesised: item.synthesised,
      logbookFactions: item.logbookFactions,
      logbookBosses: item.logbookBosses,
      atzoatlRooms: item.atzoatlRooms,
      atzoatlOpenCount: item.atzoatlOpenCount,
      storedExperience: item.storedExperience,
      ultimatumChallenge: item.ultimatumChallenge,
      ultimatumRewardText: item.ultimatumRewardText,
      ultimatumRequired: item.ultimatumRequired,
      isSynthetic: item.isSynthetic,
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

/**
 * Capture an item from PoE's clipboard. Sends Ctrl+Alt+C, polls for content,
 * falls back to windowed mode if needed. Returns the parsed item or null.
 *
 * The user's prior clipboard contents are stashed on entry and restored on exit
 * so price-checking an item doesn't stomp whatever they had copied. Explicit
 * "Copy to clipboard" actions (trade whispers, regex copy buttons) bypass this.
 */
async function captureItemFromClipboard(isElevated: () => boolean): Promise<PoeItem | null> {
  const restoreClip = snapshotClipboard()

  clipboard.clear()
  await sendCtrlCToPoE()

  // Poll for clipboard content
  let item: PoeItem | null = null
  for (let i = 0; i < 3; i++) {
    item = readItemFromClipboard()
    if (item) break
    await new Promise((r) => setTimeout(r, 50))
  }

  // Fallback for windowed mode
  if (!item) {
    clipboard.clear()
    focusGameWindow()
    await new Promise((r) => setTimeout(r, 50))
    await sendCtrlCToPoE()
    for (let i = 0; i < 10; i++) {
      item = readItemFromClipboard()
      if (item) break
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  restoreClip()

  if (!item) {
    consecutiveClipboardFailures++
    if (consecutiveClipboardFailures >= 3 && !isElevated()) {
      getOverlayWindow()?.webContents.send('elevation-hint')
    }
    getOverlayWindow()?.webContents.send('no-item-in-clipboard')
    showOverlay()
    return null
  }

  consecutiveClipboardFailures = 0
  return item
}

/** Before the hotkey handler does any work, confirm the overlay is attached to the
 *  PoE version that actually has foreground focus. If the other PoE is focused,
 *  show the restart-prompt modal -- electron-overlay-window can only attach once
 *  per process (its native tracker keeps static globals), so switching games
 *  requires an app relaunch. Fast path hits no OS call when targetHasFocus is true.
 *  Always returns false when a switch is needed: the current press is swallowed,
 *  and the user reopens the overlay from the correct game after restart. */
async function ensureCorrectGameForHotkey(store: Store<AppSettings>): Promise<boolean> {
  if (OverlayController.targetHasFocus) return true
  // User typing in an overlay text field -- swallow so single-key hotkeys
  // don't stomp the input. Otherwise if the overlay window itself is focused
  // (user clicked into it), refocus PoE so the subsequent Ctrl+C reaches the
  // game window.
  if (isTypingInOverlay()) return false
  if (getOverlayWindow()?.isFocused()) {
    focusGameWindow()
    return true
  }
  const v = await detectFocusedPoeVersion()
  if (!v) return false
  if (v === getPoeVersion()) return true
  requestGameSwitch(store, v).catch((err) => console.error('[game-switch]', err))
  return false
}

/**
 * Core copy-and-evaluate flow shared by the main hotkey and the plugin IPC handler.
 * Captures an item from the clipboard, dispatches it to the filter/price-check pipeline,
 * shows the overlay, and returns the parsed item (or null when nothing recognisable is
 * on the clipboard). Callers that want a specific overlay view should send the appropriate
 * IPC message before or after calling this.
 */
export async function runMainHotkeyFlow(store: Store<AppSettings>, isElevated: () => boolean): Promise<PoeItem | null> {
  const currentFilter = getCurrentFilter()
  if (!currentFilter) {
    getOverlayWindow()?.webContents.send('no-filter-loaded')
    showOverlay()
    return null
  }

  const item = await captureItemFromClipboard(isElevated)
  if (!item) return null

  evaluateAndSend(item)
  preloadPriceCheck(item, store)
  showOverlay()
  return item
}

export function createHotkeyHandler(store: Store<AppSettings>, isElevated: () => boolean): () => Promise<void> {
  return async function onHotkeyFired(): Promise<void> {
    if (hotkeyProcessing) return
    hotkeyProcessing = true

    try {
      if (!(await ensureCorrectGameForHotkey(store))) return
      lastCursorX = screen.getCursorScreenPoint().x

      // Flag the next overlay-data as "came from the filter hotkey" so the renderer
      // forces the item view, even when the user was on pricecheck/audit with the
      // same item already loaded (cache hit -> no view change without this).
      getOverlayWindow()?.webContents.send('filter-hotkey-open')
      await runMainHotkeyFlow(store, isElevated)
    } catch (err) {
      console.error('[hotkey] Error during hotkey processing:', err)
    } finally {
      hotkeyProcessing = false
    }
  }
}

/** Switch the overlay into price-check view and populate it with `item`. Shared by the
 *  clipboard hotkey path and UI-triggered lookups (e.g. clicking a sister overlay row). */
export async function runPriceCheck(item: PoeItem, store: Store<AppSettings>): Promise<void> {
  getOverlayWindow()?.webContents.send('price-check-open')
  await preloadPriceCheck(item, store)
  showOverlay()
  if (getCurrentFilter()) evaluateAndSend(item)
}

export function createPriceCheckHandler(store: Store<AppSettings>, isElevated: () => boolean): () => Promise<void> {
  return async function onPriceCheckFired(): Promise<void> {
    if (hotkeyProcessing) return
    hotkeyProcessing = true

    try {
      if (!(await ensureCorrectGameForHotkey(store))) return
      lastCursorX = screen.getCursorScreenPoint().x

      const item = await captureItemFromClipboard(isElevated)
      if (!item) return

      await runPriceCheck(item, store)
    } catch (err) {
      console.error('[hotkey] Error during price check processing:', err)
    } finally {
      hotkeyProcessing = false
    }
  }
}
