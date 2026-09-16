// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GameRect } from '../../../plugin-sdk/src/types'
import { createPanelDragController } from './panel-drag'

let container: HTMLDivElement
let report = vi.fn<(rect: GameRect | null) => void>()
let controller: ReturnType<typeof createPanelDragController>
function card() {
  const element = document.createElement('div')
  element.style.pointerEvents = 'auto'
  element.getBoundingClientRect = () =>
    ({
      x: Number.parseFloat(element.style.left) || 0,
      y: Number.parseFloat(element.style.top) || 100,
      width: 300,
      height: 200,
    }) as DOMRect
  container.appendChild(element)
  return element
}
function pointer(handle: HTMLElement, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0 })
  handle.dispatchEvent(event)
}
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  container = document.createElement('div')
  document.body.appendChild(container)
  report = vi.fn()
  controller = createPanelDragController(container, report)
})
afterEach(() => {
  controller.dispose()
  container.remove()
  vi.unstubAllGlobals()
})
it('moves the interactive card, updates its input region, and leaves labels fixed', () => {
  const panel = card()
  const label = document.createElement('div')
  label.style.cssText = 'position:absolute;left:500px;top:400px;pointer-events:none'
  container.appendChild(label)
  controller.setRegion({ x: 0, y: 100, width: 300, height: 200 })
  const grip = panel.querySelector('button')!
  grip.setPointerCapture = vi.fn()
  pointer(grip, 'pointerdown', 250, 110)
  pointer(grip, 'pointermove', 450, 210)
  pointer(grip, 'pointerup', 450, 210)
  expect(panel.style.left).toBe('200px')
  expect(panel.style.top).toBe('200px')
  expect(report).toHaveBeenLastCalledWith({ x: 200, y: 200, width: 300, height: 200 })
  expect(label.style.left).toBe('500px')
  expect(label.style.top).toBe('400px')
  panel.remove()
  const replacement = card()
  controller.setRegion({ x: 0, y: 100, width: 300, height: 200 })
  expect(replacement.style.left).toBe('200px')
  expect(replacement.querySelectorAll('button')).toHaveLength(1)
})
it('clears interaction on close without leaving a drag grip behind', () => {
  const panel = card()
  controller.setRegion({ x: 0, y: 100, width: 300, height: 200 })
  controller.setRegion(null)
  expect(panel.querySelector('button')).toBeNull()
  expect(report).toHaveBeenLastCalledWith(null)
})
it('preserves unknown plugin layouts without adding dragging', () => {
  const panel = card()
  const region = { x: 400, y: 300, width: 100, height: 80 }
  controller.setRegion(region)
  expect(panel.querySelector('button')).toBeNull()
  expect(report).toHaveBeenLastCalledWith(region)
})
