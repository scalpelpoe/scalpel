import type { GameRect } from '../../../plugin-sdk/src/types'

/** Move only the plugin's interactive card, never its game-aligned labels or
 * full-screen annotation window. Position survives the plugin rebuilding its
 * card after OCR completes, for this overlay session. */
export function createPanelDragController(container: HTMLElement, report: (rect: GameRect | null) => void) {
  let panel: HTMLElement | null = null
  let position: { x: number; y: number } | null = null
  let detach: (() => void) | null = null
  const publish = () => {
    if (!panel) return
    const r = panel.getBoundingClientRect()
    report({ x: r.x, y: r.y, width: r.width, height: r.height })
  }
  const place = (x: number, y: number) => {
    if (!panel) return
    const r = panel.getBoundingClientRect()
    position = {
      x: Math.max(0, Math.min(x, window.innerWidth - r.width)),
      y: Math.max(0, Math.min(y, window.innerHeight - r.height)),
    }
    panel.style.left = `${position.x}px`
    panel.style.top = `${position.y}px`
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    publish()
  }
  const resize = () => {
    if (position) place(position.x, position.y)
    else publish()
  }
  window.addEventListener('resize', resize)
  return {
    setRegion(rect: GameRect | null) {
      detach?.()
      detach = null
      panel = null
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        report(null)
        return
      }
      // Only enhance an explicitly declared, top-level interactive panel.
      // Unknown plugin layouts retain their declared input region unchanged.
      panel =
        Array.from(container.children).find((child): child is HTMLElement => {
          if (!(child instanceof HTMLElement) || getComputedStyle(child).pointerEvents === 'none') return false
          const r = child.getBoundingClientRect()
          return (
            Math.abs(r.x - rect.x) < 2 &&
            Math.abs(r.y - rect.y) < 2 &&
            Math.abs(r.width - rect.width) < 2 &&
            Math.abs(r.height - rect.height) < 2
          )
        }) ?? null
      if (!panel) {
        report(rect)
        return
      }
      const handle = document.createElement('button')
      handle.type = 'button'
      handle.textContent = '⠿'
      handle.title = 'Drag panel'
      handle.setAttribute('aria-label', 'Move annotation panel')
      handle.style.cssText =
        'position:absolute;right:36px;top:5px;width:24px;height:30px;border:0;border-radius:4px;background:#23232e;color:#c8a96e;cursor:move;pointer-events:auto;touch-action:none;z-index:1'
      const card = panel
      let drag: { id: number; x: number; y: number } | null = null
      handle.onpointerdown = (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const r = card.getBoundingClientRect()
        drag = { id: event.pointerId, x: event.clientX - r.x, y: event.clientY - r.y }
        handle.setPointerCapture(event.pointerId)
      }
      handle.onpointermove = (event) => {
        if (drag?.id === event.pointerId) place(event.clientX - drag.x, event.clientY - drag.y)
      }
      handle.onpointerup = handle.onpointercancel = () => {
        drag = null
      }
      card.appendChild(handle)
      const observer = new ResizeObserver(resize)
      observer.observe(card)
      detach = () => {
        observer.disconnect()
        handle.remove()
      }
      if (position) place(position.x, position.y)
      else publish()
    },
    dispose() {
      detach?.()
      panel = null
      window.removeEventListener('resize', resize)
      report(null)
    },
  }
}
