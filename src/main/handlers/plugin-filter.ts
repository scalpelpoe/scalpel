import { createHash } from 'node:crypto'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, FilterFile } from '@shared/types'
import { planBatchMove } from '@shared/filter-move'
import { checkRemovable } from '@shared/filter-removal'
import { record } from '../filter/intent-recorder'
import { moveBaseTypeBetweenTiers } from '../filter/writer'
import { getCurrentFilter, loadFilter, onFilterLoaded } from '../filter-state'
import { captureSnapshot } from '../history'
import { reloadFilterInGame } from '../overlay'

/** Upper bound on one call, so a runaway plugin cannot queue an unbounded rewrite. */
export const MAX_PLUGIN_MOVES = 1000

export type PluginFilterMove = { baseType: string; fromBlockLine: number; toBlockLine: number }

export type PluginFilterSkip = PluginFilterMove & {
  reason: 'no-block' | 'same-block' | 'not-named' | 'token' | 'last-base' | 'no-basetype' | 'duplicate' | 'unchanged'
}

export type PluginFilterMoveResult =
  | { ok: true; moved: number; skipped: PluginFilterSkip[] }
  | { ok: false; error: string; cancelled?: boolean; skipped?: PluginFilterSkip[] }

/** Content hash of the filter Scalpel has parsed. A plugin passes it back with a
 *  write so a plan made against an older copy of the filter is refused, not
 *  applied to block lines that no longer mean what the plugin thought. */
export function filterRevision(filter: FilterFile): string {
  return createHash('sha256')
    .update(filter.rawLines.join(filter.eol ?? '\n'))
    .digest('hex')
}

/** `name` is the base as the filter spells it. The writer matches case-sensitively
 *  while the guards do not, so writes and intents must use the filter's spelling. */
type Resolved = PluginFilterMove & { fromIndex: number; toIndex: number; name: string }

function filterSpelling(filter: FilterFile, blockIndex: number, baseType: string): string | null {
  const target = baseType.toLowerCase()
  for (const c of filter.blocks[blockIndex].conditions) {
    if (c.type !== 'BaseType') continue
    const hit = c.values.find((v) => v.toLowerCase() === target)
    if (hit) return hit
  }
  return null
}

/**
 * Turn a plugin's moves into block indexes and split out the ones Scalpel will
 * not make, using the same guards as the batch tier move: the destination must
 * list base types, the source must name the base by exact string, and a source
 * never gives up its last base.
 */
export function planPluginMoves(
  filter: FilterFile,
  moves: PluginFilterMove[],
): { apply: Resolved[]; skipped: PluginFilterSkip[] } {
  const byLine = new Map<number, number>()
  filter.blocks.forEach((b, i) => byLine.set(b.lineStart, i))

  const skipped: PluginFilterSkip[] = []
  const seen = new Set<string>()
  const candidates: Resolved[] = []

  for (const m of moves) {
    const fromIndex = byLine.get(m.fromBlockLine)
    const toIndex = byLine.get(m.toBlockLine)
    if (fromIndex === undefined || toIndex === undefined) {
      skipped.push({ ...m, reason: 'no-block' })
      continue
    }
    if (fromIndex === toIndex) {
      skipped.push({ ...m, reason: 'same-block' })
      continue
    }
    const key = `${fromIndex}\u0000${m.baseType.toLowerCase()}`
    if (seen.has(key)) {
      skipped.push({ ...m, reason: 'duplicate' })
      continue
    }
    seen.add(key)
    if (!filter.blocks[toIndex].conditions.some((c) => c.type === 'BaseType')) {
      skipped.push({ ...m, reason: 'no-basetype' })
      continue
    }
    const check = checkRemovable(filter.blocks[fromIndex], m.baseType)
    if (!check.removable && check.reason !== 'last-base') {
      skipped.push({ ...m, reason: check.reason === 'token' ? 'token' : 'not-named' })
      continue
    }
    const name = filterSpelling(filter, fromIndex, m.baseType)
    if (!name) {
      skipped.push({ ...m, reason: 'not-named' })
      continue
    }
    candidates.push({ ...m, fromIndex, toIndex, name })
  }

  // The last-base guard is per source block across the whole call, planned up
  // front for the reason planBatchMove documents (the parsed model is stale
  // between raw-line edits).
  const bySource = new Map<number, Resolved[]>()
  for (const c of candidates) {
    const list = bySource.get(c.fromIndex) ?? []
    list.push(c)
    bySource.set(c.fromIndex, list)
  }
  const apply: Resolved[] = []
  for (const [fromIndex, list] of bySource) {
    const { movable } = planBatchMove(
      filter.blocks[fromIndex],
      list.map((c) => c.name),
    )
    const ok = new Set(movable)
    for (const c of list) {
      if (ok.has(c.name)) apply.push(c)
      else
        skipped.push({
          baseType: c.baseType,
          fromBlockLine: c.fromBlockLine,
          toBlockLine: c.toBlockLine,
          reason: 'last-base',
        })
    }
  }
  return { apply, skipped }
}

function tierName(filter: FilterFile, index: number): string {
  return filter.blocks[index]?.tierTag?.tier ?? `line ${filter.blocks[index]?.lineStart ?? '?'}`
}

function isMove(v: unknown): v is PluginFilterMove {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  return (
    typeof m.baseType === 'string' &&
    m.baseType.length > 0 &&
    Number.isInteger(m.fromBlockLine) &&
    Number.isInteger(m.toBlockLine)
  )
}

export type ConfirmMoves = (sender: WebContents, pluginId: string, lines: string[], total: number) => Promise<boolean>

/** Scalpel-owned confirmation: the plugin cannot write without the user seeing the list. */
export const confirmWithDialog: ConfirmMoves = async (sender, pluginId, lines, total) => {
  const shown = lines.slice(0, 15)
  const more = total - shown.length
  const detail = shown.join('\n') + (more > 0 ? `\n...and ${more} more` : '')
  const opts = {
    type: 'question' as const,
    buttons: ['Apply', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Plugin filter change',
    message: `Plugin "${pluginId}" wants to move ${total} base type${total === 1 ? '' : 's'} in your filter.`,
    detail: `${detail}\n\nOne undo step reverts all of them.`,
  }
  const win = BrowserWindow.fromWebContents(sender)
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  return response === 0
}

const subscribers = new Set<WebContents>()
let debounce: NodeJS.Timeout | null = null
let listening = false

function emitChange(): void {
  if (subscribers.size === 0) return
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    for (const wc of subscribers) {
      if (!wc.isDestroyed()) wc.send('plugins:filter-changed')
    }
  }, 150)
}

/**
 * Register the capability backing `ctx.filter`: read the filter Scalpel has
 * loaded, watch it, and move base types through the same path the batch tier
 * move uses (one snapshot, one `move-basetype` intent per base, one reload).
 * The plugin never writes the file itself.
 */
export function registerPluginFilterHandlers(
  store: Store<AppSettings>,
  confirm: ConfirmMoves = confirmWithDialog,
): void {
  if (!listening) {
    onFilterLoaded(emitChange)
    listening = true
  }

  ipcMain.handle('plugins:filter-read', async () => {
    const filter = getCurrentFilter()
    if (!filter) return null
    return { content: filter.rawLines.join(filter.eol ?? '\n'), path: filter.path, revision: filterRevision(filter) }
  })

  ipcMain.handle(
    'plugins:filter-move-basetypes',
    async (evt: IpcMainInvokeEvent, pluginId: unknown, req: unknown): Promise<PluginFilterMoveResult> => {
      const filter = getCurrentFilter()
      if (!filter) return { ok: false, error: 'No filter loaded' }
      const r = req as { revision?: unknown; moves?: unknown } | null
      if (!r || typeof r.revision !== 'string' || !Array.isArray(r.moves) || !r.moves.every(isMove)) {
        return {
          ok: false,
          error: 'moveBaseTypes expects { revision, moves: { baseType, fromBlockLine, toBlockLine }[] }',
        }
      }
      if (r.moves.length === 0) return { ok: true, moved: 0, skipped: [] }
      if (r.moves.length > MAX_PLUGIN_MOVES) {
        return { ok: false, error: `Too many moves in one call (${r.moves.length}, limit ${MAX_PLUGIN_MOVES})` }
      }
      if (r.revision !== filterRevision(filter)) {
        return { ok: false, error: 'The filter changed since it was read. Read it again and re-plan.' }
      }

      const { apply, skipped } = planPluginMoves(filter, r.moves)
      if (apply.length === 0) return { ok: false, error: 'None of the moves can be made', skipped }

      // The id comes from the renderer, so it is display text only: strip control
      // characters and cap it so it cannot forge lines in the dialog.
      const id =
        typeof pluginId === 'string' && pluginId.trim()
          ? pluginId
              .replace(/[\u0000-\u001f\u007f]/g, ' ')
              .trim()
              .slice(0, 64)
          : 'unknown'
      const lines = apply.map((m) => `${m.name}: ${tierName(filter, m.fromIndex)} → ${tierName(filter, m.toIndex)}`)
      if (!(await confirm(evt.sender, id, lines, apply.length))) {
        return { ok: false, error: 'Cancelled by the user', cancelled: true, skipped }
      }

      // The dialog is async: refuse if the filter moved underneath it.
      const current = getCurrentFilter()
      if (!current || filterRevision(current) !== r.revision) {
        return { ok: false, error: 'The filter changed while the confirmation was open. Read it again and re-plan.' }
      }

      // Reload the file this write targeted, not the profile setting: the two
      // agree in the app, and the loaded path is the one the revision covers.
      const path = current.path
      let moved = 0
      try {
        captureSnapshot(path, 'tier-move', `Plugin ${id}: move ${apply.length} base types`)
        let working = current
        for (const m of apply) {
          const fromBlock = working.blocks[m.fromIndex]
          const toBlock = working.blocks[m.toIndex]
          const linesBefore = working.rawLines.length
          const res = moveBaseTypeBetweenTiers(working, m.name, m.fromIndex, m.toIndex)
          // Stripped is what makes it a move: if the destination already listed
          // the base, nothing is added but the source no longer catches it.
          if (res.stripped) moved++
          else
            skipped.push({
              baseType: m.baseType,
              fromBlockLine: m.fromBlockLine,
              toBlockLine: m.toBlockLine,
              reason: 'unchanged',
            })
          if ((res.added || res.stripped) && toBlock.tierTag && fromBlock.tierTag) {
            record({
              type: 'move-basetype',
              target: { typePath: toBlock.tierTag.typePath, tier: toBlock.tierTag.tier },
              payload: { value: m.name, fromTier: fromBlock.tierTag.tier },
              timestamp: Date.now(),
            })
          }
          // A strip that deleted a BaseType line shifts every later block's line
          // numbers. Re-parse so the next raw-line edit lands in the right place.
          // Block count is unchanged by a move, so the planned indexes stay valid.
          if (working.rawLines.length !== linesBefore) {
            const fresh = loadFilter(path)
            if (!fresh) throw new Error('The filter could not be re-read mid-write')
            working = fresh
          }
        }
        return { ok: true, moved, skipped }
      } catch (err) {
        return {
          ok: false,
          error: `${String(err)} (${moved} moved before the error; one undo reverts them)`,
          skipped,
        }
      } finally {
        // Also after a throw: the file may be partly written, and Scalpel's
        // parsed state and the game must match what is on disk.
        loadFilter(path)
        if (store.get('reloadOnSave') !== false) reloadFilterInGame()
      }
    },
  )

  ipcMain.on('plugins:filter-watch', (evt: IpcMainEvent) => {
    const wc = evt.sender
    if (subscribers.has(wc)) return
    subscribers.add(wc)
    wc.once('destroyed', () => subscribers.delete(wc))
  })

  ipcMain.on('plugins:filter-unwatch', (evt: IpcMainEvent) => {
    subscribers.delete(evt.sender)
  })
}
