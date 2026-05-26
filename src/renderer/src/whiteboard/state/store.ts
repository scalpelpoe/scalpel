import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { WhiteboardElement } from '../../../../shared/whiteboard-types'
import { createHistory, type History } from './history'

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'ruler' | 'radiusRing'

export type Mode = 'edit' | 'play'

/** Per-mutation options for actions that participate in the undo history. */
export interface MutationOpts {
  /** If false, skip the post-mutation history snapshot. Use for in-progress
   *  updates (text typing, mid-drag) that shouldn't pollute the undo stack.
   *  Defaults to true. */
  history?: boolean
}

export interface WhiteboardState {
  elements: WhiteboardElement[]
  selectedIds: string[]
  tool: Tool
  mode: Mode
  /** Active PoE version (1 or 2), or null until resolved. Distance tools need
   *  it to project; null disables them. */
  poeVersion: 1 | 2 | null
  setPoeVersion: (v: 1 | 2 | null) => void
  color: string
  /** Stroke width normalized to game height. */
  width: number
  /** Drawings-layer global opacity, 0.2 - 1.0. */
  drawingsOpacity: number
  shapeVariant: 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow'
  textFontSize: number // normalized to game height
  editingTextId: string | null

  /** Deep clones of the last-copied elements. Empty if nothing has been
   *  copied yet (or after a session reset). */
  clipboard: WhiteboardElement[]
  /** Number of times the current clipboard has been pasted. Used by callers
   *  to compute a cumulative offset so successive pastes stagger visually.
   *  Resets on every `copyToClipboard` call. */
  pasteCount: number

  /** True iff state has changed since the last successful save. */
  dirty: boolean
  /** Increments on every history operation (commit, undo, redo). Toolbar
   *  components subscribe to this so canUndo/canRedo derived values stay fresh
   *  without coupling to element-array changes. */
  historyVersion: number

  setTool: (t: Tool) => void
  setMode: (m: Mode) => void
  setColor: (c: string) => void
  setWidth: (w: number) => void
  setDrawingsOpacity: (o: number) => void
  setSelectedIds: (ids: string[]) => void
  setShapeVariant: (v: WhiteboardState['shapeVariant']) => void
  setTextFontSize: (n: number) => void
  setEditingTextId: (id: string | null) => void

  /** Append an element and commit a history snapshot. */
  addElement: (el: WhiteboardElement) => void
  /** Append a batch of elements with a single history snapshot. Used by
   *  paste so N pasted elements collapse into one undo step. */
  addElements: (els: WhiteboardElement[]) => void
  /** Replace one element by id and (by default) commit a history snapshot.
   *  Pass `{ history: false }` for in-progress edits (e.g. text typing) that
   *  shouldn't show up in the undo stack. */
  updateElement: (id: string, updater: (el: WhiteboardElement) => WhiteboardElement, opts?: MutationOpts) => void
  /** Remove elements by id and commit a history snapshot. */
  removeElements: (ids: string[]) => void
  /** Wipe all elements and commit a history snapshot. */
  clearAll: () => void
  /** Bulk-replace the element list without committing to history. Used for
   *  loading saved state and in-progress erase passes; callers that want
   *  history should call `snapshotForHistory` themselves at the right grouping
   *  boundary. */
  replaceAll: (els: WhiteboardElement[]) => void
  /** Move elements to the end of the array (rendered on top), preserving
   *  their relative order. Pass one id for a single-element action; pass the
   *  selection ids for a multi-element action. Commits a history snapshot. */
  bringToFront: (ids: string[]) => void
  /** Move elements to the start of the array (rendered behind everything),
   *  preserving their relative order. Commits a history snapshot. */
  sendToBack: (ids: string[]) => void

  /** Stash deep clones of the matching elements in the in-memory clipboard
   *  and reset `pasteCount`. No-op if `ids` matches nothing. */
  copyToClipboard: (ids: string[]) => void
  /** Paste a list of elements with a single history snapshot. `translate` is
   *  applied to each clone (for positioning) before fresh ids are assigned.
   *  `source` defaults to the in-memory clipboard; pass external elements
   *  (e.g. parsed from the OS clipboard) to paste those instead. Returns the
   *  new ids and selects them. Increments `pasteCount`. No-op on empty
   *  source. */
  pasteFromClipboard: (
    translate: (el: WhiteboardElement) => WhiteboardElement,
    source?: WhiteboardElement[],
  ) => string[]

  markClean: () => void

  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => void
  redo: () => void
  /** Explicitly commit the current elements array to history. Most mutating
   *  actions snapshot for you; this is for the two cases that don't fit that
   *  pattern:
   *    - seeding the initial state on first mount, so the first user action
   *      has somewhere to undo back to
   *    - grouping a streak of `replaceAll` calls (mid-drag erase) into one
   *      history entry at the end of the gesture */
  snapshotForHistory: () => void
}

const DEFAULT_COLOR = '#ffd24d'
const DEFAULT_WIDTH = 0.009

export type WhiteboardStore = UseBoundStore<StoreApi<WhiteboardState>>

export function createWhiteboardStore(): WhiteboardStore {
  const history: History<WhiteboardElement[]> = createHistory({ max: 100 })
  return create<WhiteboardState>((set, get) => {
    /** Commit the current elements to history and bump the version counter
     *  so subscribers (e.g. the Toolbar's canUndo/canRedo) re-render. */
    function commitHistory(): void {
      history.commit(get().elements)
      set((s) => ({ historyVersion: s.historyVersion + 1 }))
    }

    return {
      elements: [],
      selectedIds: [],
      tool: 'select',
      mode: 'edit',
      poeVersion: null,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
      drawingsOpacity: 1,
      shapeVariant: 'rect',
      textFontSize: 0.025,
      editingTextId: null,
      clipboard: [],
      pasteCount: 0,
      dirty: false,
      historyVersion: 0,

      setTool: (t) => set({ tool: t }),
      setMode: (m) => set({ mode: m }),
      setPoeVersion: (v) => set({ poeVersion: v }),
      setColor: (c) => set({ color: c }),
      setWidth: (w) => set({ width: w }),
      setDrawingsOpacity: (o) => set({ drawingsOpacity: o }),
      setSelectedIds: (ids) => set({ selectedIds: ids }),
      setShapeVariant: (v) => set({ shapeVariant: v }),
      setTextFontSize: (n) => set({ textFontSize: n }),
      setEditingTextId: (id) => set({ editingTextId: id }),

      addElement: (el) => {
        set((s) => ({ elements: [...s.elements, el], dirty: true }))
        commitHistory()
      },
      addElements: (els) => {
        if (els.length === 0) return
        set((s) => ({ elements: [...s.elements, ...els], dirty: true }))
        commitHistory()
      },
      updateElement: (id, updater, opts) => {
        set((s) => ({
          elements: s.elements.map((e) => (e.id === id ? updater(e) : e)),
          dirty: true,
        }))
        if (opts?.history !== false) commitHistory()
      },
      removeElements: (ids) => {
        set((s) => ({
          elements: s.elements.filter((e) => !ids.includes(e.id)),
          selectedIds: s.selectedIds.filter((id) => !ids.includes(id)),
          dirty: true,
        }))
        commitHistory()
      },
      clearAll: () => {
        set({ elements: [], selectedIds: [], dirty: true })
        commitHistory()
      },
      replaceAll: (els) => set({ elements: els, selectedIds: [], dirty: true }),
      bringToFront: (ids) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        const elements = get().elements
        const kept: WhiteboardElement[] = []
        const moving: WhiteboardElement[] = []
        for (const el of elements) {
          if (idSet.has(el.id)) moving.push(el)
          else kept.push(el)
        }
        if (moving.length === 0) return
        set({ elements: [...kept, ...moving], dirty: true })
        commitHistory()
      },
      sendToBack: (ids) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        const elements = get().elements
        const kept: WhiteboardElement[] = []
        const moving: WhiteboardElement[] = []
        for (const el of elements) {
          if (idSet.has(el.id)) moving.push(el)
          else kept.push(el)
        }
        if (moving.length === 0) return
        set({ elements: [...moving, ...kept], dirty: true })
        commitHistory()
      },

      copyToClipboard: (ids) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        // Preserve in-canvas order in the clipboard so multi-paste retains
        // the user's visual z-stack on the way out.
        const picked = get().elements.filter((e) => idSet.has(e.id))
        if (picked.length === 0) return
        // Elements are plain serializable data (no functions / refs), so JSON
        // round-trip is the simplest deep clone available.
        const clipboard = picked.map((e) => JSON.parse(JSON.stringify(e)) as WhiteboardElement)
        set({ clipboard, pasteCount: 0 })
      },
      pasteFromClipboard: (translate, source) => {
        const elements = source ?? get().clipboard
        if (elements.length === 0) return []
        const clones: WhiteboardElement[] = elements.map((el) => {
          const translated = translate(el)
          // Fresh ids on every paste so pastes don't collide with each other
          // or with the originals on the canvas.
          return { ...translated, id: crypto.randomUUID() }
        })
        const newIds = clones.map((c) => c.id)
        set((s) => ({
          elements: [...s.elements, ...clones],
          selectedIds: newIds,
          dirty: true,
          pasteCount: s.pasteCount + 1,
        }))
        commitHistory()
        return newIds
      },

      markClean: () => set({ dirty: false }),

      canUndo: () => history.canUndo(),
      canRedo: () => history.canRedo(),
      undo: () => {
        const cur = get().elements
        const prev = history.undo(cur)
        if (prev !== null)
          set((s) => ({
            elements: prev,
            dirty: true,
            selectedIds: [],
            historyVersion: s.historyVersion + 1,
          }))
      },
      redo: () => {
        const cur = get().elements
        const next = history.redo(cur)
        if (next !== null)
          set((s) => ({
            elements: next,
            dirty: true,
            selectedIds: [],
            historyVersion: s.historyVersion + 1,
          }))
      },
      snapshotForHistory: commitHistory,
    }
  })
}

/** Module-level singleton for the live whiteboard renderer. Tests should
 *  build their own with `createWhiteboardStore`. */
export const useWhiteboardStore = createWhiteboardStore()
