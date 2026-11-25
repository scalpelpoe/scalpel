import { execFile, execFileSync } from 'node:child_process'
import { UiohookKey } from 'uiohook-napi'
import { reportBreadcrumb, reportDiagnostic } from '../../common/diagnostics'

/**
 * Wayland/X11 key injection through user-space CLI tools.
 *
 * Kept free of overlay/native-input imports so the portal input path and a
 * future layer-shell facade can route explicit backend choices here without a
 * module cycle.
 */

export type InjectionTool = 'ydotool' | 'wtype'
export type KeyDirection = 'down' | 'up'

/** Give the compositor/game a frame to register each synthetic key event.
 *  ydotool accepts several events in one call, but games coalesce them and can
 *  miss the modifier press if the main key follows in the same batch. */
const COMBO_EVENT_SPACING_MS = 25
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// No-op probes: these connect to the tool's real injection backend (ydotool's
// daemon / wtype's compositor keyboard) without sending a usable key. A binary
// merely being on PATH is not enough.
const TOOL_PROBES: Record<InjectionTool, string[]> = {
  ydotool: ['key', '0:0'],
  wtype: ['-k', 'VoidSymbol'],
}

let cachedTool: InjectionTool | null | undefined
const cachedExplicit = new Map<InjectionTool, { ok: boolean; at: number }>()
const EXPLICIT_PROBE_TTL_MS = 30_000
let queue: Promise<void> = Promise.resolve()

function probeTool(tool: InjectionTool): boolean {
  try {
    execFileSync(tool, TOOL_PROBES[tool], { stdio: 'ignore', timeout: 1_500 })
    return true
  } catch {
    return false
  }
}

function getTool(): InjectionTool | null {
  if (cachedTool !== undefined) return cachedTool
  for (const tool of ['ydotool', 'wtype'] as const) {
    if (probeTool(tool)) {
      cachedTool = tool
      return tool
    }
  }
  cachedTool = null
  return null
}

/** Resolves an explicit ydotool/wtype preference, falling back to whichever
 *  working tool is available. Returns null only when neither tool works. */
export function preferredTool(preferred: InjectionTool | 'auto' = 'auto'): InjectionTool | null {
  if (preferred !== 'auto') {
    const cached = cachedExplicit.get(preferred)
    if (cached && Date.now() - cached.at < EXPLICIT_PROBE_TTL_MS) {
      if (cached.ok) return preferred
    } else {
      const ok = probeTool(preferred)
      cachedExplicit.set(preferred, { ok, at: Date.now() })
      if (ok) return preferred
      reportDiagnostic('key-injection', new Error(`${preferred} is unavailable`))
    }
    return getTool()
  }
  return getTool()
}

// uIOhook uses Linux evdev keycodes for ordinary keys. Extended values are
// uIOhook virtual-key encodings and need translating back to evdev.
const LINUX_KEYCODE: Record<number, number> = {
  [UiohookKey.PageUp]: 104,
  [UiohookKey.PageDown]: 109,
  [UiohookKey.End]: 107,
  [UiohookKey.Home]: 102,
  [UiohookKey.ArrowLeft]: 105,
  [UiohookKey.ArrowUp]: 103,
  [UiohookKey.ArrowRight]: 106,
  [UiohookKey.ArrowDown]: 108,
  [UiohookKey.Insert]: 110,
  [UiohookKey.Delete]: 111,
  [UiohookKey.CtrlRight]: 97,
  [UiohookKey.AltRight]: 100,
  [UiohookKey.Ctrl]: 29,
  [UiohookKey.Alt]: 56,
  [UiohookKey.Shift]: 42,
  [UiohookKey.ShiftRight]: 54,
}

/** uIOhook's letter/number/function values are Linux evdev keycodes, not ASCII
 *  codes (A=30, B=48, C=46 ...), so deriving a keysym by subtraction types the
 *  wrong letter. Map every key explicitly instead. */
const WTYPE_ALPHABET: ReadonlyArray<readonly [string, number]> = [
  ['a', UiohookKey.A],
  ['b', UiohookKey.B],
  ['c', UiohookKey.C],
  ['d', UiohookKey.D],
  ['e', UiohookKey.E],
  ['f', UiohookKey.F],
  ['g', UiohookKey.G],
  ['h', UiohookKey.H],
  ['i', UiohookKey.I],
  ['j', UiohookKey.J],
  ['k', UiohookKey.K],
  ['l', UiohookKey.L],
  ['m', UiohookKey.M],
  ['n', UiohookKey.N],
  ['o', UiohookKey.O],
  ['p', UiohookKey.P],
  ['q', UiohookKey.Q],
  ['r', UiohookKey.R],
  ['s', UiohookKey.S],
  ['t', UiohookKey.T],
  ['u', UiohookKey.U],
  ['v', UiohookKey.V],
  ['w', UiohookKey.W],
  ['x', UiohookKey.X],
  ['y', UiohookKey.Y],
  ['z', UiohookKey.Z],
  ['0', UiohookKey['0']],
  ['1', UiohookKey['1']],
  ['2', UiohookKey['2']],
  ['3', UiohookKey['3']],
  ['4', UiohookKey['4']],
  ['5', UiohookKey['5']],
  ['6', UiohookKey['6']],
  ['7', UiohookKey['7']],
  ['8', UiohookKey['8']],
  ['9', UiohookKey['9']],
  ...Array.from({ length: 12 }, (_, index): readonly [string, number] => [
    `F${index + 1}`,
    UiohookKey[`F${index + 1}` as keyof typeof UiohookKey] as number,
  ]),
]

const WTYPE_KEY: Record<number, string> = Object.fromEntries(
  WTYPE_ALPHABET.map(([keysym, keycode]) => [keycode, keysym]),
)

const WTYPE_SPECIAL_KEY: Record<number, string> = {
  [UiohookKey.Backspace]: 'BackSpace',
  [UiohookKey.Tab]: 'Tab',
  [UiohookKey.Enter]: 'Return',
  [UiohookKey.Escape]: 'Escape',
  [UiohookKey.Space]: 'space',
  [UiohookKey.PageUp]: 'Prior',
  [UiohookKey.PageDown]: 'Next',
  [UiohookKey.End]: 'End',
  [UiohookKey.Home]: 'Home',
  [UiohookKey.ArrowLeft]: 'Left',
  [UiohookKey.ArrowUp]: 'Up',
  [UiohookKey.ArrowRight]: 'Right',
  [UiohookKey.ArrowDown]: 'Down',
  [UiohookKey.Insert]: 'Insert',
  [UiohookKey.Delete]: 'Delete',
  [UiohookKey.Comma]: 'comma',
  [UiohookKey.Minus]: 'minus',
  [UiohookKey.Period]: 'period',
  [UiohookKey.Slash]: 'slash',
  [UiohookKey.Backquote]: 'grave',
  [UiohookKey.Ctrl]: 'ctrl',
  [UiohookKey.CtrlRight]: 'ctrl',
  [UiohookKey.Alt]: 'alt',
  [UiohookKey.AltRight]: 'alt',
  [UiohookKey.Shift]: 'shift',
  [UiohookKey.ShiftRight]: 'shift',
}

function linuxKeycode(keycode: number): number {
  return LINUX_KEYCODE[keycode] ?? keycode
}

function wtypeKey(keycode: number): string | null {
  return WTYPE_SPECIAL_KEY[keycode] ?? WTYPE_KEY[keycode] ?? null
}

/** Append to the single injection queue. Tool failures are reported but never
 *  reject: a failed copy must still fall through to the clipboard poll and its
 *  user-visible "no item" hint instead of aborting the hotkey flow. */
function enqueue(tool: InjectionTool, args: string[]): Promise<void> {
  queue = queue.then(
    () =>
      new Promise<void>((resolve) => {
        execFile(tool, args, { timeout: 5000 }, (error) => {
          if (error) reportDiagnostic('key-injection', error)
          resolve()
        })
      }),
  )
  return queue
}

/** Tap a key through the chosen tool. A press/release pair in one process
 *  keeps the sequence ordered even under a busy game. */
export function tapWithTool(tool: InjectionTool, keycode: number): void {
  if (tool === 'ydotool') {
    const code = linuxKeycode(keycode)
    enqueue(tool, ['key', `${code}:1`, `${code}:0`])
    return
  }
  const key = wtypeKey(keycode)
  if (key) enqueue(tool, ['-k', key])
  else reportDiagnostic('key-injection', new Error(`Unsupported keycode: ${keycode}`))
}

/** Press or release a key. wtype cannot hold keys across invocations, so a
 *  modifier toggle always prefers ydotool. */
export function toggleWithTool(tool: InjectionTool, keycode: number, direction: KeyDirection): void {
  if (tool === 'ydotool') {
    enqueue(tool, ['key', `${linuxKeycode(keycode)}:${direction === 'down' ? 1 : 0}`])
    return
  }
  // wtype destroys its virtual keyboard when the process exits, so it cannot
  // send a standalone keyup. Tapping the key instead would fake a fresh press
  // into the game (typing a letter or toggling a modifier), which is worse than
  // doing nothing. Portal releases its own grab; ydotool is required for an
  // explicit modifier release.
  if (direction === 'up') return
  reportDiagnostic('key-injection', new Error('wtype cannot hold keys; install ydotool'))
}

function wtypeModifier(keycode: number): 'ctrl' | 'alt' | 'shift' | null {
  if (keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight) return 'ctrl'
  if (keycode === UiohookKey.Alt || keycode === UiohookKey.AltRight) return 'alt'
  if (keycode === UiohookKey.Shift || keycode === UiohookKey.ShiftRight) return 'shift'
  return null
}

/** Send a whole combo as one coherent sequence. Modifiers first, main key last.
 *
 *  wtype cannot hold a modifier between separate invocations (its virtual
 *  keyboard is destroyed when the process exits), so a wtype combo must be a
 *  single `-M ... -k key -m ...` call. ydotool can hold keys, but a game can
 *  coalesce events from one call, so each event is spaced out and any stale
 *  modifier from the triggering hotkey is released first. */
export async function tapCombo(tool: InjectionTool, keycodes: readonly number[]): Promise<void> {
  if (keycodes.length === 0) return
  const key = keycodes[keycodes.length - 1]
  const modifiers = keycodes.slice(0, -1)

  if (tool === 'wtype') {
    const mods = modifiers.map(wtypeModifier)
    if (mods.some((mod) => mod === null)) throw new Error('Unsupported wtype modifier in key combo')
    const args: string[] = []
    for (const mod of mods) args.push('-M', mod as string)
    const keysym = wtypeKey(key)
    if (!keysym) throw new Error(`Unsupported wtype keycode: ${key}`)
    args.push('-k', keysym)
    for (const mod of mods.slice().reverse()) args.push('-m', mod as string)
    reportBreadcrumb(`[linux/input] wtype combo: ${args.join(' ')}`, 'debug')
    await enqueue(tool, args)
    return
  }

  const held: number[] = []
  try {
    // The portal hotkey may still own the keyboard with modifiers held. Clear
    // ydotool's virtual state before pressing a fresh combo.
    for (const code of modifiers) {
      await enqueue(tool, ['key', `${linuxKeycode(code)}:0`])
      await sleep(COMBO_EVENT_SPACING_MS)
    }
    for (const code of modifiers) {
      await enqueue(tool, ['key', `${linuxKeycode(code)}:1`])
      held.push(code)
      await sleep(COMBO_EVENT_SPACING_MS)
    }
    await enqueue(tool, ['key', `${linuxKeycode(key)}:1`])
    await sleep(COMBO_EVENT_SPACING_MS)
    await enqueue(tool, ['key', `${linuxKeycode(key)}:0`])
    await sleep(COMBO_EVENT_SPACING_MS)
  } finally {
    for (const code of held.reverse()) {
      try {
        await enqueue(tool, ['key', `${linuxKeycode(code)}:0`])
        await sleep(COMBO_EVENT_SPACING_MS)
      } catch {
        // Do not mask the original injection error with cleanup noise.
      }
    }
  }
}

/** @internal Exported so tests can clear the tool cache. */
export function resetToolCache(): void {
  cachedTool = undefined
  cachedExplicit.clear()
}
