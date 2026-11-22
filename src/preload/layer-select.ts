/**
 * In-page popups for native `<select>` elements in layer-shell overlays.
 *
 * Offscreen rendering never paints a `<select>`'s popup into the frame; on
 * Wayland Chromium opens it as a native popup of the hidden window instead,
 * which shows as a stray sliver. Under layer-shell the popup is drawn into
 * the page here, and its area is added to the window's reported panel rects
 * so the surface's input region accepts the pointer over it. Choosing an
 * option sets the value and fires `input` and `change` like the native popup.
 */

import { LAYER_SELECT_ARG } from '@shared/contracts/overlay'

type Rect = { left: number; top: number; width: number; height: number }

const MAX_HEIGHT = 320
const MARGIN = 4

let host: HTMLDivElement | null = null
let list: HTMLDivElement | null = null
let owner: HTMLSelectElement | null = null
let active = -1
let items: HTMLDivElement[] = []
/** Last panel rects the page reported; null while the window reports none. */
let pageRects: Rect[] | null = null
let send: (rects: Rect[]) => void = () => {}

function popupRect(): Rect | null {
  if (!list) return null
  const r = list.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function report(): void {
  if (pageRects === null) return
  const popup = popupRect()
  send(popup ? [...pageRects, popup] : pageRects)
}

function close(): void {
  host?.remove()
  host = list = owner = null
  items = []
  active = -1
  report()
}

function choose(select: HTMLSelectElement, index: number): void {
  close()
  select.focus()
  if (index === select.selectedIndex) return
  select.selectedIndex = index
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function highlight(index: number): void {
  items[active]?.classList.remove('active')
  active = index
  const item = items[active]
  if (!item) return
  item.classList.add('active')
  item.scrollIntoView({ block: 'nearest' })
}

function step(delta: 1 | -1): void {
  if (!owner) return
  let i = active
  do i += delta
  while (i >= 0 && i < items.length && owner.options[Number(items[i].dataset.index)].disabled)
  if (i >= 0 && i < items.length) highlight(i)
}

function open(select: HTMLSelectElement): void {
  close()
  owner = select
  const style = getComputedStyle(select)
  const bounds = select.getBoundingClientRect()
  // The page styles native popups through its `option` and `optgroup` rules.
  const option = select.querySelector('option')
  const optionStyle = option ? getComputedStyle(option) : style
  const groupEl = select.querySelector('optgroup')
  const group = groupEl ? getComputedStyle(groupEl) : null

  host = document.createElement('div')
  const root = host.attachShadow({ mode: 'open' })
  const sheet = document.createElement('style')
  sheet.textContent = `${pageScrollbarRules()}
    .list { position: fixed; z-index: 2147483647; overflow-y: auto; box-sizing: border-box;
      min-width: ${bounds.width}px; max-width: calc(100vw - ${MARGIN * 2}px);
      font: ${style.font}; color: ${optionStyle.color};
      background: ${opaque(optionStyle.backgroundColor, opaque(style.backgroundColor, FALLBACK_BACKGROUND))};
      border: 1px solid rgba(255, 255, 255, 0.12); border-radius: ${style.borderRadius}; padding: 2px 0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); user-select: none; }
    .item { padding: 3px 10px; white-space: nowrap; cursor: ${optionStyle.cursor}; }
    .item.nested { padding-left: 20px; }
    .item.active { background: rgba(255, 255, 255, 0.1); }
    .item.disabled { opacity: 0.45; }
    .group { padding: 3px 10px; font-weight: ${group?.fontWeight ?? 'bold'};
      ${group ? `color: ${group.color}; font-size: ${group.fontSize}; font-style: ${group.fontStyle}; background: ${group.backgroundColor};` : ''} }`
  list = document.createElement('div')
  list.className = 'list'
  list.setAttribute('role', 'listbox')

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const label = document.createElement('div')
      label.className = 'group'
      label.textContent = child.label
      list.append(label)
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) addItem(option, true)
      }
    } else if (child instanceof HTMLOptionElement) {
      addItem(child, false)
    }
  }

  // Keep the popup's clicks from reaching the page's outside-click handlers.
  list.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  list.addEventListener('click', (e) => {
    e.stopPropagation()
    const item = (e.target as Element).closest<HTMLDivElement>('.item')
    if (!item || !owner) return
    const option = owner.options[Number(item.dataset.index)]
    if (option && !option.disabled) choose(owner, option.index)
  })
  list.addEventListener('mousemove', (e) => {
    const item = (e.target as Element).closest<HTMLDivElement>('.item')
    if (item) highlight(items.indexOf(item))
  })

  root.append(sheet, list)
  document.documentElement.append(host)

  // Below the select when it fits, otherwise above it, within the window.
  const below = window.innerHeight - bounds.bottom - MARGIN
  const above = bounds.top - MARGIN
  const height = Math.min(list.offsetHeight, MAX_HEIGHT, Math.max(below, above))
  list.style.maxHeight = `${height}px`
  list.style.top = `${height <= below || below >= above ? bounds.bottom : bounds.top - height}px`
  list.style.left = `${Math.max(MARGIN, Math.min(bounds.left, window.innerWidth - list.offsetWidth - MARGIN))}px`

  highlight(items.findIndex((item) => Number(item.dataset.index) === select.selectedIndex))
  report()

  function addItem(option: HTMLOptionElement, nested: boolean): void {
    if (option.hidden) return
    const item = document.createElement('div')
    item.className = `item${nested ? ' nested' : ''}${option.disabled ? ' disabled' : ''}`
    item.setAttribute('role', 'option')
    item.dataset.index = String(option.index)
    item.textContent = option.label || option.text
    list?.append(item)
    items.push(item)
  }
}

const FALLBACK_BACKGROUND = '#23232e'

/** The page's global scrollbar rules, which do not cross into the popup's shadow root. */
function pageScrollbarRules(): string {
  const rules: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList
    try {
      list = sheet.cssRules
    } catch {
      continue // cross-origin sheet
    }
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule && rule.selectorText.startsWith('::-webkit-scrollbar')) rules.push(rule.cssText)
    }
  }
  return rules.join('\n')
}

/** A translucent background would leave the popup see-through. */
function opaque(color: string, fallback: string): string {
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
  if (!match) return fallback
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  return alpha >= 0.9 ? color : fallback
}

function popupSelect(target: EventTarget | null): HTMLSelectElement | null {
  const select = target instanceof Element ? target.closest('select') : null
  return select && !select.disabled && !select.multiple && select.size <= 1 ? select : null
}

function onMouseDown(e: MouseEvent): void {
  if (host && e.composedPath().includes(host)) return
  const select = e.button === 0 ? popupSelect(e.target) : null
  if (!select) {
    if (owner) close()
    return
  }
  // Stops Chromium from opening its native popup.
  e.preventDefault()
  select.focus()
  if (owner === select) close()
  else open(select)
}

function onKeyDown(e: KeyboardEvent): void {
  if (owner) {
    const keys: Record<string, () => void> = {
      Escape: close,
      Tab: close,
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Enter: () => {
        const item = items[active]
        if (item && owner) choose(owner, Number(item.dataset.index))
      },
      ' ': () => keys.Enter(),
    }
    const action = keys[e.key]
    if (!action) return
    if (e.key !== 'Tab') {
      e.preventDefault()
      e.stopPropagation()
    }
    action()
    return
  }
  // The keys that open the native popup; arrows alone change the value in place.
  const opens = e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')
  const select = opens ? popupSelect(e.target) : null
  if (!select) return
  e.preventDefault()
  open(select)
}

/**
 * Installs the in-page popups and wraps the window's panel-rect reporting.
 * Returns the reporter the preload should expose in place of the raw IPC
 * send, or `send` itself outside layer-shell.
 */
export function installLayerSelect(sendRects: (rects: Rect[]) => void): (rects: Rect[]) => void {
  if (!process.argv.includes(LAYER_SELECT_ARG)) return sendRects
  send = sendRects
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', () => owner && close())
  window.addEventListener('resize', () => owner && close())
  // A scrolled page moves the select away from its popup.
  window.addEventListener('scroll', (e) => owner && !(host && e.composedPath().includes(host)) && close(), true)
  return (rects) => {
    pageRects = rects
    report()
  }
}

/** Forgets the page's rects when it clears them, so a popup does not report alone. */
export function clearLayerSelectRects(): void {
  pageRects = null
  if (owner) close()
}
