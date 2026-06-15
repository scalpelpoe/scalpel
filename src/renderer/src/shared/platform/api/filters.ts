/**
 * Renderer API adapter for filter file operations, editing, history, and versions.
 *
 * Preparatory wrappers around window.api. Existing renderer code still calls the
 * preload bridge directly; migrate call sites incrementally when touching filter
 * screens.
 */

import type { FilterBlock, FilterListEntry } from '@shared/contracts/items'
import type { HistoryEntry, FilterChange, FilterVersion } from '@shared/contracts/history'

// ── Filter files ──────────────────────────────────────────────────────────────

export function pickFilterFile(): Promise<string | null> {
  return window.api.pickFilterFile()
}

export function pickFilterDir(): Promise<string | null> {
  return window.api.pickFilterDir()
}

export function scanFilterDir(dir: string): Promise<FilterListEntry[]> {
  return window.api.scanFilterDir(dir)
}

export function scanSoundFiles(dir: string): Promise<string[]> {
  return window.api.scanSoundFiles(dir)
}

export function getSoundDataUrl(dir: string, filename: string): Promise<string | null> {
  return window.api.getSoundDataUrl(dir, filename)
}

export function importOnlineFilter(
  sourcePath: string,
  filterName: string,
  targetDir: string,
  force?: boolean,
): Promise<{ ok: boolean; path?: string; error?: string; conflict?: boolean }> {
  return window.api.importOnlineFilter(sourcePath, filterName, targetDir, force)
}

export function switchIngameFilter(
  filterName: string,
  currentFilter?: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.switchIngameFilter(filterName, currentFilter)
}

// ── Filter editing ────────────────────────────────────────────────────────────

export function saveBlockEdit(
  blockIndex: number,
  block: FilterBlock,
  itemJson?: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.saveBlockEdit(blockIndex, block, itemJson)
}

export function reloadFilter(): Promise<{ ok: boolean; error?: string }> {
  return window.api.reloadFilter()
}

export function getUniqueVisibility(): Promise<Record<string, 'Show' | 'Hide'>> {
  return window.api.getUniqueVisibility()
}

export function moveItemTier(
  baseType: string,
  fromBlockIndex: number,
  toBlockIndex: number,
  itemJson: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.moveItemTier(baseType, fromBlockIndex, toBlockIndex, itemJson)
}

export function batchMoveItemTier(
  baseTypes: string[],
  fromBlockIndex: number,
  toBlockIndex: number,
  itemJson: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.batchMoveItemTier(baseTypes, fromBlockIndex, toBlockIndex, itemJson)
}

export function updateStackThresholds(
  oldBoundary: number,
  newBoundary: number,
  itemJson: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.updateStackThresholds(oldBoundary, newBoundary, itemJson)
}

export function updateQualityThresholds(
  oldBoundary: number,
  newBoundary: number,
  itemJson: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.updateQualityThresholds(oldBoundary, newBoundary, itemJson)
}

export function updateStrandThresholds(
  oldBoundary: number,
  newBoundary: number,
  itemJson: string,
): Promise<{ ok: boolean; error?: string }> {
  return window.api.updateStrandThresholds(oldBoundary, newBoundary, itemJson)
}

export function getColorFrequencies(): Promise<
  Record<string, Array<{ r: number; g: number; b: number; a: number; count: number; category: string }>>
> {
  return window.api.getColorFrequencies()
}

// ── History & versions ───────────────────────────────────────────────────────

export function getHistory(): Promise<HistoryEntry[]> {
  return window.api.getHistory()
}

export function undoEdit(itemJson?: string): Promise<{ ok: boolean; error?: string }> {
  return window.api.undoEdit(itemJson)
}

export function listVersions(): Promise<FilterVersion[]> {
  return window.api.listVersions()
}

export function createCheckpoint(label?: string): Promise<{ ok: boolean; error?: string }> {
  return window.api.createCheckpoint(label)
}

export function restoreVersion(filename: string, itemJson?: string): Promise<{ ok: boolean; error?: string }> {
  return window.api.restoreVersion(filename, itemJson)
}

export function deleteVersion(filename: string): Promise<{ ok: boolean; error?: string }> {
  return window.api.deleteVersion(filename)
}

export function getFilterChanges(): Promise<FilterChange[]> {
  return window.api.getFilterChanges()
}

// ── Events ────────────────────────────────────────────────────────────────────

export function onFilterChanged(cb: () => void): () => void {
  return window.api.onFilterChanged(cb)
}

export function onOnlineFilterChanged(cb: (changed: { path: string; name: string }[]) => void): () => void {
  return window.api.onOnlineFilterChanged(cb)
}

// ── Online sync ───────────────────────────────────────────────────────────────

export function checkForOnlineUpdate(): Promise<{ ok: boolean; error?: string }> {
  return window.api.checkForOnlineUpdate()
}

export function getOnlineSyncStatus(): Promise<{ hasOnlineSource: boolean }> {
  return window.api.getOnlineSyncStatus()
}

export function getFilterResetAvailability(): Promise<{ canReset: boolean }> {
  return window.api.getFilterResetAvailability()
}

export function resetFilterToOnline(): Promise<{ ok: boolean; error?: string }> {
  return window.api.resetFilterToOnline()
}

export function quickUpdateFilter(): Promise<{
  ok: boolean
  error?: string
  stats?: {
    unchanged: number
    upstreamOnly: number
    userOnly: number
    bothChanged: number
    added: number
    removed: number
  }
  conflicts?: Array<{ description: string; actionType: string }>
}> {
  return window.api.quickUpdateFilter()
}

export function mergeOnlineFilter(
  onlineFilterName: string,
  onlinePath: string,
  localPath: string,
): Promise<{
  ok: boolean
  error?: string
  conflicts?: Array<{ description: string; actionType: string }>
  stats?: {
    unchanged: number
    upstreamOnly: number
    userOnly: number
    bothChanged: number
    added: number
    removed: number
  }
}> {
  return window.api.mergeOnlineFilter(onlineFilterName, onlinePath, localPath)
}
