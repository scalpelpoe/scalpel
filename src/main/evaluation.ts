import { clipboard, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import type Store from 'electron-store'
import { isTownOrHideout } from '@shared/is-town-or-hideout'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import type { AppSettings, FilterFile, MatchResult, OverlayData, PoeItem, TierGroup, TierSibling } from '@shared/types'
import { getCurrentZone } from './client-log'
import { snapshotClipboard } from './clipboard-preserve'
import { getProfileBackedSetting } from './profiles/profile-settings'
import {
  evaluateBlock,
  findMatchingBlocks,
  findQualityBreakpoints,
  findStackSizeBreakpoints,
  findStrandBreakpoints,
} from './filter/matcher'
import { getCurrentFilter } from './filter-state'
import { getPoeVersion } from './game-state'
import { sendCtrlCToPoE } from './hotkeys'
import { focusGameWindow, getOverlayWindow, showOverlay } from './overlay'
import { readItemFromClipboard } from './trade/clipboard'
import {
  getUniquesByBase,
  lookupItemPrice,
  lookupPrice,
  lookupPriceForItem,
  lookupUniquePriceForBase,
  refreshPrices,
} from './trade/prices'
import { ensureStatsLoaded, matchItemMods } from './trade/trade'
import { beginSession, decisionsForSession } from './learning'

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

/** Forget the last displayed item so a subsequent reEvaluateLastItem() is a
 *  no-op. A relaunch-based game switch dropped this naturally (fresh process);
 *  the experimental in-process switch must clear it explicitly, otherwise the
 *  filter reload that fires on profile activation would re-evaluate the previous
 *  game's item and pop the (closed) overlay back open on the new game. */
export function clearLastEvaluatedItem(): void {
  lastEvaluatedItem = null
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
  const divinePrice = lookupPrice('Divine Orb', 'Divine Orb')
  const payload: OverlayData = {
    item,
    matches,
    stackBreakpoints,
    qualityBreakpoints: effectiveQualityBps,
    strandBreakpoints: effectiveStrandBps,
    tierGroup,
    priceInfo,
    chaosPerDivine: divinePrice?.chaosValue,
    divineGraph: divinePrice?.graph,
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
  const league = getProfileBackedSetting(store, 'league')
  await refreshPrices(league)
  const priceInfo = lookupItemPrice(item)

  // For unidentified uniques, find all possible uniques for this base type
  const unidCandidates: Array<{ name: string; chaosValue: number }> = []
  if (item.rarity === 'Unique' && !item.identified) {
    const uniquesByBase = getUniquesByBase()
    const names = uniquesByBase[item.baseType] ?? []
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
      name: item.name,
      gemLevel: item.gemLevel,
      corrupted: item.corrupted,
      mirrored: item.mirrored,
      identified: item.identified,
      influence: item.influence,
      mapTier: item.mapTier,
      mapQuantity: item.mapQuantity,
      mapRarity: item.mapRarity,
      mapPackSize: item.mapPackSize,
      mapMoreScarabs: item.mapMoreScarabs,
      mapMoreCurrency: item.mapMoreCurrency,
      mapMoreMaps: item.mapMoreMaps,
      mapMoreDivCards: item.mapMoreDivCards,
      mapRevives: item.mapRevives,
      mapDropChance: item.mapDropChance,
      mapGold: item.mapGold,
      mapMagicMonsters: item.mapMagicMonsters,
      mapRareMonsters: item.mapRareMonsters,
      enchants: item.enchants,
      runes: item.runes,
      imbues: item.imbues,
      grantedSkills: item.grantedSkills,
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
      unidentifiedTier: item.unidentifiedItemTier,
      chartZone: item.chartZone,
      chartShape: item.chartShape,
      scryingArea: item.scryingArea,
    },
    item.advancedMods,
    store.get('priceCheckDefaultPercent') ?? 90,
  )

  const sessionId = beginSession(item)
  const learnedDecisions = decisionsForSession(statFilters, item)

  const divinePrice = lookupPrice('Divine Orb', 'Divine Orb')
  const chaosPerDivine = divinePrice?.chaosValue ?? 0
  getOverlayWindow()?.webContents.send(IPC_CHANNELS.OVERLAY.PRICE_CHECK_EVENT, {
    item,
    priceInfo,
    statFilters,
    league,
    chaosPerDivine,
    divineGraph: divinePrice?.graph,
    sessionId,
    learnedDecisions,
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
 *
 * On a failed capture, shows the main overlay unless `opts.showOverlay` is
 * explicitly false - the `elevation-hint` and `no-item-in-clipboard` IPC
 * messages still fire regardless, so the renderer's state is correct the next
 * time the overlay opens.
 */
async function captureItemFromClipboard(
  isElevated: () => boolean,
  opts?: { showOverlay?: boolean },
): Promise<PoeItem | null> {
  const showOverlayFlag = opts?.showOverlay ?? true
  const restoreClip = snapshotClipboard()

  // Hotkeys are also valid while a gameplay overlay owns focus. Hand input
  // back to PoE before copying so that path is as immediate as game focus.
  if (!OverlayController.targetHasFocus) focusGameWindow()
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
    if (showOverlayFlag) showOverlay()
    return null
  }

  consecutiveClipboardFailures = 0
  return item
}

/**
 * Core copy-and-evaluate flow shared by the main hotkey and the plugin IPC handler.
 * Captures an item from the clipboard and dispatches it to the filter/price-check
 * pipeline, returning the parsed item (or null when nothing recognisable is on the
 * clipboard). Shows the main overlay unless `opts.showOverlay` is explicitly false -
 * a plugin with its own overlay passes that to avoid Scalpel's overlay popping open
 * on top of it. The suppression also covers a failed clipboard capture (no filter
 * loaded, nothing recognisable on the clipboard), not just the success path.
 * Callers that want a specific overlay view should send the appropriate IPC message
 * before or after calling this.
 *
 * `opts.dispatch` defaults to true. When explicitly false, this is a private read:
 * the item is captured and returned to the caller alone. `evaluateAndSend` (which
 * pushes `overlay-data` and hijacks the main overlay's view to 'item') and
 * `preloadPriceCheck` (which warms the price-check pipeline) are both skipped, and
 * since nothing is evaluated against a filter, the no-filter early return does not
 * apply either - no filter needs to be loaded, and `no-filter-loaded` is not sent.
 */
export async function runMainHotkeyFlow(
  store: Store<AppSettings>,
  isElevated: () => boolean,
  opts?: { showOverlay?: boolean; dispatch?: boolean },
): Promise<PoeItem | null> {
  const showOverlayFlag = opts?.showOverlay ?? true
  const dispatchFlag = opts?.dispatch ?? true

  if (dispatchFlag) {
    const currentFilter = getCurrentFilter()
    if (!currentFilter) {
      getOverlayWindow()?.webContents.send('no-filter-loaded')
      if (showOverlayFlag) showOverlay()
      return null
    }
  }

  const item = await captureItemFromClipboard(isElevated, { showOverlay: showOverlayFlag })
  if (!item) return null

  if (dispatchFlag) {
    evaluateAndSend(item)
    preloadPriceCheck(item, store)
  }
  if (showOverlayFlag) showOverlay()
  return item
}

export function createHotkeyHandler(store: Store<AppSettings>, isElevated: () => boolean): () => Promise<void> {
  return async function onHotkeyFired(): Promise<void> {
    if (hotkeyProcessing) return
    hotkeyProcessing = true

    try {
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
  getOverlayWindow()?.webContents.send(IPC_CHANNELS.OVERLAY.PRICE_CHECK_OPEN_EVENT)
  await preloadPriceCheck(item, store)
  showOverlay()
  if (getCurrentFilter()) evaluateAndSend(item)
}

export function createPriceCheckHandler(store: Store<AppSettings>, isElevated: () => boolean): () => Promise<void> {
  return async function onPriceCheckFired(): Promise<void> {
    if (hotkeyProcessing) return
    hotkeyProcessing = true

    try {
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
