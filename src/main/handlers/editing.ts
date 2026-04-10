import { ipcMain } from 'electron'
import Store from 'electron-store'
import { getCurrentFilter, loadFilter } from '../filter-state'
import { evaluateAndSend } from '../evaluation'
import { reloadFilterInGame } from '../overlay'
import { captureSnapshot } from '../history'
import { record } from '../filter/intent-recorder'
import {
  writeBlockEdit,
  moveBaseTypeBetweenTiers,
  updateStackThresholds,
  updateQualityThresholds,
  updateStrandThresholds,
} from '../filter/writer'
import type { AppSettings, FilterAction, FilterBlock, PoeItem } from '../../shared/types'

// ---- History description helpers -------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  SetTextColor: 'text color',
  SetBorderColor: 'border color',
  SetBackgroundColor: 'background color',
  SetFontSize: 'font size',
  PlayAlertSound: 'alert sound',
  PlayAlertSoundPositional: 'alert sound',
  PlaySound: 'alert sound',
  PlayEffect: 'beam effect',
  MinimapIcon: 'minimap icon',
  CustomAlertSound: 'custom sound',
  CustomAlertSoundOptional: 'custom sound',
  DisableDropSound: 'drop sound',
  EnableDropSound: 'drop sound',
}

function describeBlockEdit(oldBlock: FilterBlock, newBlock: FilterBlock): string {
  const changes: string[] = []

  // Visibility change
  if (oldBlock.visibility !== newBlock.visibility) {
    changes.push(`${oldBlock.visibility} \u2192 ${newBlock.visibility}`)
  }

  // Build action maps for comparison
  const oldActions = new Map<string, FilterAction>()
  for (const a of oldBlock.actions) oldActions.set(a.type, a)
  const newActions = new Map<string, FilterAction>()
  for (const a of newBlock.actions) newActions.set(a.type, a)

  // Detect changed/added/removed actions
  for (const [type, newAction] of newActions) {
    const oldAction = oldActions.get(type)
    const label = ACTION_LABELS[type] ?? type
    if (!oldAction) {
      // Added
      if (newAction.values.length > 0) changes.push(`added ${label}`)
    } else if (JSON.stringify(oldAction.values) !== JSON.stringify(newAction.values)) {
      // Changed
      if (newAction.values.length === 0) {
        changes.push(`removed ${label}`)
      } else {
        changes.push(`changed ${label}`)
      }
    }
  }
  for (const [type] of oldActions) {
    if (!newActions.has(type)) {
      changes.push(`removed ${ACTION_LABELS[type] ?? type}`)
    }
  }

  if (changes.length === 0) return 'No visible changes'
  // Capitalize first change, join with commas
  const desc = changes.join(', ')
  return desc.charAt(0).toUpperCase() + desc.slice(1)
}

// ---- IPC handlers ----------------------------------------------------------

export function register(store: Store<AppSettings>): void {
  ipcMain.handle('save-block-edit', (_event, blockIndex: number, updatedBlock: FilterBlock, itemJson?: string) => {
    const currentFilter = getCurrentFilter()
    if (!currentFilter) return { ok: false, error: 'No filter loaded' }
    try {
      const oldBlock = currentFilter.blocks[blockIndex]
      const item: PoeItem | undefined = itemJson ? JSON.parse(itemJson) : undefined
      const _tier = oldBlock?.tierTag?.tier ?? `block #${blockIndex + 1}`
      const changedActions: string[] = []
      if (oldBlock.visibility !== updatedBlock.visibility) changedActions.push('visibility')
      const oldActionsStr = new Map(oldBlock.actions.map((a) => [a.type, JSON.stringify(a.values)]))
      const newActionsStr = new Map(updatedBlock.actions.map((a) => [a.type, JSON.stringify(a.values)]))
      for (const [type, val] of newActionsStr) {
        if (oldActionsStr.get(type) !== val) changedActions.push(type)
      }
      for (const type of oldActionsStr.keys()) {
        if (!newActionsStr.has(type)) changedActions.push(type)
      }
      const itemName = item?.baseType
      const desc = describeBlockEdit(oldBlock, updatedBlock)
      captureSnapshot(currentFilter.path, 'block-edit', desc, itemName)
      // Record intents for the edit
      const tierTag = oldBlock.tierTag
      if (tierTag) {
        const target = { typePath: tierTag.typePath, tier: tierTag.tier }
        const now = Date.now()

        // Visibility change
        if (oldBlock.visibility !== updatedBlock.visibility) {
          record({
            type: 'set-visibility',
            target,
            payload: { visibility: updatedBlock.visibility },
            timestamp: now,
          })
        }

        // Action changes - compare old vs new
        const oldActionsMap = new Map(oldBlock.actions.map((a) => [a.type, a.values]))
        const newActionsMap = new Map(updatedBlock.actions.map((a) => [a.type, a.values]))
        for (const [actionType, newValues] of newActionsMap) {
          const oldValues = oldActionsMap.get(actionType)
          if (!oldValues || JSON.stringify(oldValues) !== JSON.stringify(newValues)) {
            record({
              type: 'set-action',
              target,
              payload: { action: actionType, values: newValues },
              timestamp: now,
            })
          }
        }
        // Actions removed
        for (const [actionType] of oldActionsMap) {
          if (!newActionsMap.has(actionType)) {
            record({
              type: 'set-action',
              target,
              payload: { action: actionType, values: [] },
              timestamp: now,
            })
          }
        }
      }
      writeBlockEdit(currentFilter, blockIndex, updatedBlock)
      // Reload to get fresh parsed state
      const path = store.get('filterPath')
      if (path) loadFilter(path)

      // Re-evaluate and send fresh overlay data
      const freshFilter = getCurrentFilter()
      if (freshFilter && item) {
        evaluateAndSend(item)
      }
      reloadFilterInGame()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'move-item-tier',
    (_event, baseType: string, fromBlockIndex: number, toBlockIndex: number, itemJson: string) => {
      const currentFilter = getCurrentFilter()
      if (!currentFilter) return { ok: false, error: 'No filter loaded' }
      try {
        const fromTier = currentFilter.blocks[fromBlockIndex]?.tierTag?.tier ?? `block #${fromBlockIndex + 1}`
        const toTier = currentFilter.blocks[toBlockIndex]?.tierTag?.tier ?? `block #${toBlockIndex + 1}`
        captureSnapshot(currentFilter.path, 'tier-move', `Moved "${baseType}" from ${fromTier} to ${toTier}`, baseType)
        // Record intent
        const fromBlock = currentFilter.blocks[fromBlockIndex]
        const toBlock = currentFilter.blocks[toBlockIndex]
        if (toBlock.tierTag && fromBlock.tierTag) {
          record({
            type: 'move-basetype',
            target: { typePath: toBlock.tierTag.typePath, tier: toBlock.tierTag.tier },
            payload: { value: baseType, fromTier: fromBlock.tierTag.tier },
            timestamp: Date.now(),
          })
        }
        moveBaseTypeBetweenTiers(currentFilter, baseType, fromBlockIndex, toBlockIndex)
        // Reload to get fresh parsed state
        const path = store.get('filterPath')
        if (path) loadFilter(path)

        // Re-evaluate the item against the updated filter and send fresh data
        const freshFilter = getCurrentFilter()
        if (freshFilter && itemJson) {
          const item: PoeItem = JSON.parse(itemJson)
          evaluateAndSend(item)
        }

        if (store.get('reloadOnSave') !== false) reloadFilterInGame()

        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'batch-move-item-tier',
    (_event, baseTypes: string[], fromBlockIndex: number, toBlockIndex: number, itemJson: string) => {
      const currentFilter = getCurrentFilter()
      if (!currentFilter) return { ok: false, error: 'No filter loaded' }
      try {
        const fromTier = currentFilter.blocks[fromBlockIndex]?.tierTag?.tier ?? `block #${fromBlockIndex + 1}`
        const toTier = currentFilter.blocks[toBlockIndex]?.tierTag?.tier ?? `block #${toBlockIndex + 1}`
        captureSnapshot(
          currentFilter.path,
          'tier-move',
          `Moved ${baseTypes.length} items from ${fromTier} to ${toTier}`,
        )
        for (const bt of baseTypes) {
          // Record intent
          const fromBlock = currentFilter.blocks[fromBlockIndex]
          const toBlock = currentFilter.blocks[toBlockIndex]
          if (toBlock.tierTag && fromBlock.tierTag) {
            record({
              type: 'move-basetype',
              target: { typePath: toBlock.tierTag.typePath, tier: toBlock.tierTag.tier },
              payload: { value: bt, fromTier: fromBlock.tierTag.tier },
              timestamp: Date.now(),
            })
          }
          moveBaseTypeBetweenTiers(currentFilter, bt, fromBlockIndex, toBlockIndex)
        }
        const path = store.get('filterPath')
        if (path) loadFilter(path)

        const freshFilter = getCurrentFilter()
        if (freshFilter && itemJson) {
          const item: PoeItem = JSON.parse(itemJson)
          evaluateAndSend(item)
        }

        if (store.get('reloadOnSave') !== false) reloadFilterInGame()

        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('update-stack-thresholds', (_event, oldBoundary: number, newBoundary: number, itemJson: string) => {
    const currentFilter = getCurrentFilter()
    if (!currentFilter) return { ok: false, error: 'No filter loaded' }
    try {
      const item: PoeItem | undefined = itemJson ? JSON.parse(itemJson) : undefined
      captureSnapshot(
        currentFilter.path,
        'stack-threshold',
        `Changed stack boundary ${oldBoundary} \u2192 ${newBoundary}`,
        item?.baseType,
      )
      // Record threshold intent - find the block that owns this threshold
      for (const block of currentFilter.blocks) {
        if (!block.tierTag) continue
        const hasThreshold = block.conditions.some(
          (c) => c.type === 'StackSize' && parseInt(c.values[0]) === oldBoundary,
        )
        if (hasThreshold) {
          record({
            type: 'set-threshold',
            target: { typePath: block.tierTag.typePath, tier: block.tierTag.tier },
            payload: {
              condition: 'StackSize',
              operator: block.conditions.find((c) => c.type === 'StackSize')?.operator ?? '>=',
              value: newBoundary,
            },
            timestamp: Date.now(),
          })
        }
      }
      updateStackThresholds(currentFilter, oldBoundary, newBoundary)
      // Reload to get fresh parsed state
      const path = store.get('filterPath')
      if (path) loadFilter(path)

      // Re-evaluate and send fresh data
      const freshFilter = getCurrentFilter()
      if (freshFilter && item) {
        evaluateAndSend(item)
      }

      if (store.get('reloadOnSave') !== false) reloadFilterInGame()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('update-quality-thresholds', (_event, oldBoundary: number, newBoundary: number, itemJson: string) => {
    const currentFilter = getCurrentFilter()
    if (!currentFilter) return { ok: false, error: 'No filter loaded' }
    try {
      const item: PoeItem | undefined = itemJson ? JSON.parse(itemJson) : undefined
      captureSnapshot(
        currentFilter.path,
        'stack-threshold',
        `Changed quality boundary ${oldBoundary} \u2192 ${newBoundary}`,
        item?.baseType,
      )
      // Record threshold intent
      for (const block of currentFilter.blocks) {
        if (!block.tierTag) continue
        const hasThreshold = block.conditions.some((c) => c.type === 'Quality' && parseInt(c.values[0]) === oldBoundary)
        if (hasThreshold) {
          record({
            type: 'set-threshold',
            target: { typePath: block.tierTag.typePath, tier: block.tierTag.tier },
            payload: {
              condition: 'Quality',
              operator: block.conditions.find((c) => c.type === 'Quality')?.operator ?? '>=',
              value: newBoundary,
            },
            timestamp: Date.now(),
          })
        }
      }
      updateQualityThresholds(currentFilter, oldBoundary, newBoundary)
      const path = store.get('filterPath')
      if (path) loadFilter(path)
      const freshFilter = getCurrentFilter()
      if (freshFilter && item) {
        evaluateAndSend(item)
      }
      if (store.get('reloadOnSave') !== false) reloadFilterInGame()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('update-strand-thresholds', (_event, oldBoundary: number, newBoundary: number, itemJson: string) => {
    const currentFilter = getCurrentFilter()
    if (!currentFilter) return { ok: false, error: 'No filter loaded' }
    try {
      const item: PoeItem | undefined = itemJson ? JSON.parse(itemJson) : undefined
      captureSnapshot(
        currentFilter.path,
        'strand-threshold',
        `Changed strand boundary ${oldBoundary} \u2192 ${newBoundary}`,
        item?.baseType,
      )
      for (const block of currentFilter.blocks) {
        if (!block.tierTag) continue
        const hasThreshold = block.conditions.some(
          (c) => c.type === 'MemoryStrands' && parseInt(c.values[0]) === oldBoundary,
        )
        if (hasThreshold) {
          record({
            type: 'set-threshold',
            target: { typePath: block.tierTag.typePath, tier: block.tierTag.tier },
            payload: {
              condition: 'MemoryStrands',
              operator: block.conditions.find((c) => c.type === 'MemoryStrands')?.operator ?? '>=',
              value: newBoundary,
            },
            timestamp: Date.now(),
          })
        }
      }
      updateStrandThresholds(currentFilter, oldBoundary, newBoundary)
      const path = store.get('filterPath')
      if (path) loadFilter(path)
      const freshFilter = getCurrentFilter()
      if (freshFilter && item) evaluateAndSend(item)
      if (store.get('reloadOnSave') !== false) reloadFilterInGame()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('reload-filter', () => {
    const path = store.get('filterPath')
    if (!path) return { ok: false, error: 'No filter path set' }
    return { ok: !!loadFilter(path) }
  })
}
