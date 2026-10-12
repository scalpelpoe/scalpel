import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { trackLinuxBounds } from './linux-bounds'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function setup() {
  const win = Object.assign(new EventEmitter(), { isDestroyed: () => false })
  const persist = vi.fn()
  const state = { programmatic: false }
  trackLinuxBounds(win as unknown as Electron.BrowserWindow, () => state.programmatic, persist)
  return { win, persist, state }
}
it('saves a Linux drag and resize without completion events, coalescing repeated moves', () => {
  const { win, persist } = setup()
  win.emit('move')
  vi.advanceTimersByTime(100)
  win.emit('move')
  win.emit('resize')
  vi.advanceTimersByTime(149)
  expect(persist).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(persist).toHaveBeenCalledOnce()
})
it('flushes the last position when focus loss hides the window immediately after a drag', () => {
  const { win, persist } = setup()
  win.emit('move')
  win.emit('hide')
  expect(persist).toHaveBeenCalledOnce()
  vi.runAllTimers()
  expect(persist).toHaveBeenCalledOnce()
})
it('does not save game tracking moves as user positions', () => {
  const { win, persist, state } = setup()
  state.programmatic = true
  win.emit('move')
  win.emit('resize')
  vi.runAllTimers()
  expect(persist).not.toHaveBeenCalled()
})
it('cancels persistence when the window closes', () => {
  const { win, persist } = setup()
  win.emit('move')
  win.emit('closed')
  vi.runAllTimers()
  expect(persist).not.toHaveBeenCalled()
})
