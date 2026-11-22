// @vitest-environment jsdom
import { LAYER_SELECT_ARG } from '@shared/contracts/overlay'
import { describe, expect, it, vi } from 'vitest'

type Rect = { left: number; top: number; width: number; height: number }

const PANEL = { left: 0, top: 0, width: 100, height: 50 }

const sent = vi.fn<(rects: Rect[]) => void>()
let installed: ((rects: Rect[]) => void) | null = null

// Listeners stay on the window, so the popup is installed once per file.
async function setup(flag = true) {
  const mod = await import('./layer-select')
  if (!flag) return { report: mod.installLayerSelect(sent), ...page() }
  if (!installed) {
    const argv = process.argv
    process.argv = [...argv, LAYER_SELECT_ARG]
    installed = mod.installLayerSelect(sent)
    process.argv = argv
  }
  mod.clearLayerSelectRects()
  sent.mockClear()
  return { report: installed, ...page() }
}

function page() {
  document.body.innerHTML = `<select id="s">
    <option value="a">Any time</option>
    <optgroup label="Recent"><option value="b">A day</option><option value="c" disabled>Never</option></optgroup>
  </select><button id="out">x</button>`
  const select = document.getElementById('s') as HTMLSelectElement
  const popup = () => document.documentElement.lastElementChild?.shadowRoot?.querySelector('.list') ?? null
  const items = () => Array.from(popup()?.querySelectorAll<HTMLElement>('.item') ?? [])
  const press = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  return { select, popup, items, press }
}

// jsdom does not lay out, so it has no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn()

describe('layer-shell select popups', () => {
  it('leaves selects alone outside layer-shell', async () => {
    const { report, select, popup, press } = await setup(false)
    expect(report).toBe(sent)
    expect(press(select)).toBe(true)
    expect(popup()).toBeNull()
  })

  it('opens in the page instead of natively and lists options with group headings', async () => {
    const { select, popup, items, press } = await setup()
    expect(press(select)).toBe(false)
    expect(popup()).not.toBeNull()
    expect(items().map((i) => i.textContent)).toEqual(['Any time', 'A day', 'Never'])
    expect(popup()?.querySelector('.group')?.textContent).toBe('Recent')
  })

  it('chooses an option like the native popup and closes', async () => {
    const { select, popup, items, press } = await setup()
    const change = vi.fn()
    select.addEventListener('change', change)
    press(select)
    items()[1].click()
    expect(select.value).toBe('b')
    expect(change).toHaveBeenCalledOnce()
    expect(popup()).toBeNull()
  })

  it('ignores disabled options', async () => {
    const { select, items, press } = await setup()
    press(select)
    items()[2].click()
    expect(select.value).toBe('a')
  })

  it('adds the popup to the reported panel rects while open', async () => {
    const { report, select, items, press } = await setup()
    report([PANEL])
    expect(sent).toHaveBeenLastCalledWith([PANEL])
    press(select)
    expect(sent.mock.lastCall?.[0]).toHaveLength(2)
    items()[0].click()
    expect(sent).toHaveBeenLastCalledWith([PANEL])
  })

  it('closes on an outside press and on Escape, and picks with the keyboard', async () => {
    const { select, popup, press } = await setup()
    press(select)
    press(document.getElementById('out') as Element)
    expect(popup()).toBeNull()

    press(select)
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(popup()).toBeNull()

    select.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    expect(popup()).not.toBeNull()
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(select.value).toBe('b')
  })
})
