import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useWhiteboardStore } from '../../state/store'
import { useDismissOnOutside } from '@renderer/shared/use-dismiss-on-outside'
import { measureTextBbox } from '../tools/text'
import type { GameSize } from '../coords'

interface Props {
  size: GameSize
}

export interface TextEditorHandle {
  /** Commit any in-progress text now. Used by Stage on tool-switch so text
   *  isn't discarded when the user switches away while editing. */
  commit: () => void
}

export const TextEditor = forwardRef<TextEditorHandle, Props>(function TextEditor(
  { size },
  fwdRef,
): JSX.Element | null {
  const editingTextId = useWhiteboardStore((s) => s.editingTextId)
  const elements = useWhiteboardStore((s) => s.elements)
  const updateElement = useWhiteboardStore((s) => s.updateElement)
  const removeElements = useWhiteboardStore((s) => s.removeElements)
  const setEditingTextId = useWhiteboardStore((s) => s.setEditingTextId)
  const ref = useRef<HTMLDivElement>(null)
  // Guards against double-commit: explicit commit (click-outside, Escape,
  // Enter) followed by an external editingTextId clear (tool-switch path)
  // would otherwise re-fire commit on a now-stale target.
  const committedRef = useRef(false)

  const el = editingTextId ? elements.find((e) => e.id === editingTextId) : null
  const target = el && el.type === 'text' ? el : null

  useEffect(() => {
    committedRef.current = false
  }, [target?.id])

  // Mount: set the initial text imperatively (the editor is uncontrolled so
  // the user's caret position survives store updates) and place the caret at
  // the end. Deferred past the click that opened us so Konva's canvas-focus
  // doesn't stomp our focus call.
  useEffect(() => {
    if (!target) return
    const node = ref.current
    if (!node) return
    if (node.innerText !== target.text) {
      node.innerText = target.text
    }
    const id = setTimeout(() => {
      node.focus()
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }, 0)
    return () => clearTimeout(id)
  }, [target?.id])

  // Click-outside / Escape commits.
  useDismissOnOutside(ref, () => commit(), target !== null)

  function commit(): void {
    if (committedRef.current || !target) return
    committedRef.current = true
    const node = ref.current
    const text = node?.innerText ?? target.text
    if (text.trim().length === 0) {
      removeElements([target.id])
    } else {
      const measured = measureTextBbox(text, target.fontSize, size)
      updateElement(target.id, (curr) =>
        curr.type === 'text' ? { ...curr, text, bbox: { ...curr.bbox, w: measured.w, h: measured.h } } : curr,
      )
    }
    setEditingTextId(null)
  }

  useImperativeHandle(fwdRef, () => ({ commit }), [target?.id])

  if (!target) return null

  const xPx = target.bbox.x * size.w
  const yPx = target.bbox.y * size.h
  const fontSizePx = target.fontSize * size.h
  // HTML renders the cap-top a bit below the inline box top (line-height
  // half-leading + Segoe UI's ascent ratio). Konva.Text uses textBaseline='middle'
  // and treats the node's y as the glyph top. Empirically tuned 0.14 lands
  // them at the same vertical position so committing doesn't visually shift.
  const HTML_LEADING_OFFSET = fontSizePx * 0.14

  return (
    <div
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      onInput={(e) => {
        const text = e.currentTarget.innerText
        // Each keystroke shouldn't pollute the undo stack; the final commit
        // (Escape / click-outside / Enter) is what writes to history.
        updateElement(target.id, (curr) => (curr.type === 'text' ? { ...curr, text } : curr), { history: false })
      }}
      onKeyDown={(e) => {
        // Stop the canvas-level Escape handler (which would close the
        // whiteboard window) - the dismiss-on-outside hook below already
        // catches Escape and commits this text. Other keys fall through to
        // the browser's contenteditable default, so Enter inserts a newline
        // and the user can keep typing multi-line.
        if (e.key === 'Escape') e.stopPropagation()
      }}
      style={{
        position: 'absolute',
        left: xPx,
        top: yPx - HTML_LEADING_OFFSET,
        font: `${target.fontWeight} ${fontSizePx}px 'Segoe UI', system-ui`,
        color: target.color,
        background: 'transparent',
        outline: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        lineHeight: 1.2,
        whiteSpace: 'pre',
        minWidth: '1ch',
        cursor: 'text',
        caretColor: target.color,
        zIndex: 100,
        display: 'inline-block',
      }}
    />
  )
})
