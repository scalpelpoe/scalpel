// Warps the OS cursor back to the radial menu's open point so item-reading
// actions (price check, filter check, wiki) target the item the menu was
// opened over. SetCursorPos wants physical px; stored points are DIP.
// Native Windows implementation; the desktop backend handles other platforms.
import { screen } from 'electron'
import koffi from 'koffi'

type SetCursorPos = (x: number, y: number) => boolean

let setCursorPos: SetCursorPos | null = null
if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll')
    setCursorPos = user32.func('bool SetCursorPos(int x, int y)') as SetCursorPos
  } catch {
    setCursorPos = null
  }
}

/** Pure composition, exported for tests: DIP point -> physical -> SetCursorPos. */
export function warpWith(
  dipPoint: { x: number; y: number },
  deps: {
    dipToScreen: (p: { x: number; y: number }) => { x: number; y: number }
    set: SetCursorPos
  },
): void {
  const phys = deps.dipToScreen(dipPoint)
  deps.set(Math.round(phys.x), Math.round(phys.y))
}

export function warpWindowsCursorTo(dipPoint: { x: number; y: number }): void {
  if (!setCursorPos) return
  try {
    warpWith(dipPoint, { dipToScreen: (p) => screen.dipToScreenPoint(p), set: setCursorPos })
  } catch {
    // Best-effort; a failed warp only degrades item targeting.
  }
}
