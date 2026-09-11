import { desktop } from './desktop'
import { clipboard, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import type Store from 'electron-store'
import { isTownOrHideout } from '@shared/is-town-or-hideout'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import type { AppSettings, OverlayData, PoeItem } from '@shared/types'
import { buildTierGroup } from './filter/tier-group'
import { getCurrentZone } from './client-log'
import { snapshotClipboard } from './clipboard-preserve'
import { getProfileBackedSetting } from './profiles/profile-settings'
import {
  findMatchingBlocks,
  findQualityBreakpoints,
  findStackSizeBreakpoints,
  findStrandBreakpoints,
} from './filter/matcher'
import { getCurrentFilter } from './filter-state'
import { getPoeVersion } from './game-state'
import { sendCtrlCToPoE } from './hotkeys'
import { focusGameWindow, getOverlayWindow, showOverlay } from './overlay'
import { advancedCopyTracker } from './trade/advanced-copy'
import { readItemFromClipboard } from './trade/clipboard'
import { buildUnidCandidates, lookupItemPrice, lookupPrice, lookupPriceForItem, refreshPrices } from './trade/prices'
import { ensureStatsLoaded, matchItemMods } from './trade/trade'
import { beginSession, decisionsForSession } from './learning'

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
  const unidCandidates = item.rarity === 'Unique' && !item.identified ? buildUnidCandidates(item.baseType) : []

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
      sanctified: item.sanctified,
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
      intangibility: item.intangibility,
      physDamageMin: item.physDamageMin,
      physDamageMax: item.physDamageMax,
      eleDamageAvg: item.eleDamageAvg,
      chaosDamageAvg: item.chaosDamageAvg,
      attacksPerSecond: item.attacksPerSecond,
      critChance: item.critChance,
      heistJobs: item.heistJobs,
      heistTarget: item.heistTarget,
      monsterLevel: item.monsterLevel,
      wingsRevealed: item.wingsRevealed,
      wingsTotal: item.wingsTotal,
      mapReward: item.mapReward,
      transfigured: item.transfigured,
      synthesised: item.synthesised,
      vestigial: item.vestigial,
      foulborn: item.foulborn,
      zanaMemory: item.zanaMemory,
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
      mercenaryBuild: item.mercenaryBuild,
      mercenaryLevel: item.mercenaryLevel,
      mercenarySkills: item.mercenarySkills,
      requiredLevel: item.requiredLevel,
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

/** Poll the clipboard for a parseable item, giving PoE `tries` x 50ms to land it. */
async function pollClipboardForItem(tries: number): Promise<PoeItem | null> {
  for (let i = 0; i < tries; i++) {
    const item = readItemFromClipboard()
    if (item) return item
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

/**
 * Capture an item from PoE's clipboard. Sends Ctrl+C, polls for content,
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

  let item: PoeItem | null = null
  // Focusing the game and injecting keys are both native calls that can throw.
  // The clipboard is borrowed (and cleared) by then, so hand it back on the way
  // out no matter how we leave - a leaked borrow holds the user's content
  // hostage and blocks any overlapping flow's restore too (#562).
  try {
    // Hotkeys are also valid while a gameplay overlay owns focus. Hand input
    // back to PoE before copying so that path is as immediate as game focus.
    if (!OverlayController.targetHasFocus) focusGameWindow()
    const withAlt = advancedCopyTracker.needsAlt()
    clipboard.clear()
    await sendCtrlCToPoE({ withAlt })

    item = await pollClipboardForItem(3)

    // Fallback for windowed mode
    if (!item) {
      clipboard.clear()
      focusGameWindow()
      await new Promise((r) => setTimeout(r, 50))
      await sendCtrlCToPoE({ withAlt })
      item = await pollClipboardForItem(10)
    }

    // A modded item that came back without advanced-mod headers means this client
    // still wants Alt held to emit the advanced description. Confirm with a second
    // copy before latching -- see advanced-copy.ts. Costs nothing once both games
    // honour a plain Ctrl+C (#560), since the probe never fires.
    if (item && advancedCopyTracker.shouldProbe(item)) {
      clipboard.clear()
      await sendCtrlCToPoE({ withAlt: true })
      item = advancedCopyTracker.recordProbe(await pollClipboardForItem(3)) ?? item
    }
  } finally {
    restoreClip()
  }

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
      lastCursorX = desktop.getCursorScreenPoint()?.x ?? lastCursorX

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
      lastCursorX = desktop.getCursorScreenPoint()?.x ?? lastCursorX

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
