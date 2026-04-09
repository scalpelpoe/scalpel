import { uIOhook, UiohookKey } from 'uiohook-napi'
import { execFile } from 'child_process'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app, globalShortcut } from 'electron'
import { OverlayController } from 'electron-overlay-window'

// ─── Accelerator → uiohook keycode mapping ────────────────────────────────────

const LETTER_KEYS: Record<string, number> = Object.fromEntries(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, UiohookKey[c as keyof typeof UiohookKey]]),
)

const EXTRA_KEYS: Record<string, number> = {
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
  Space: UiohookKey.Space,
  Tab: UiohookKey.Tab,
  Escape: UiohookKey.Escape,
  Delete: UiohookKey.Delete,
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  '0': UiohookKey['0'],
  '1': UiohookKey['1'],
  '2': UiohookKey['2'],
  '3': UiohookKey['3'],
  '4': UiohookKey['4'],
  '5': UiohookKey['5'],
  '6': UiohookKey['6'],
  '7': UiohookKey['7'],
  '8': UiohookKey['8'],
  '9': UiohookKey['9'],
}

const KEY_MAP = { ...LETTER_KEYS, ...EXTRA_KEYS }

interface ParsedHotkey {
  keyCode: number
  ctrl: boolean
  alt: boolean
  shift: boolean
}

/** Parse an Electron accelerator string into uiohook-compatible components.
 *  e.g. "CommandOrControl+G" → { keyCode: UiohookKey.G, ctrl: true, ... } */
function parseAccelerator(acc: string): ParsedHotkey | null {
  const parts = acc.split('+')
  const keyName = parts.pop()!.trim()
  const mods = parts.map((p) => p.trim().toLowerCase())

  const keyCode = KEY_MAP[keyName] ?? KEY_MAP[keyName.toUpperCase()]
  if (!keyCode) {
    console.error(`[hotkeys] Unrecognised key in accelerator: "${keyName}"`)
    return null
  }

  // On Windows, CommandOrControl = Ctrl
  const ctrl = mods.some((m) => ['control', 'ctrl', 'commandorcontrol'].includes(m))
  const alt = mods.includes('alt')
  const shift = mods.includes('shift')

  return { keyCode, ctrl, alt, shift }
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentAccelerator: string | null = null
let currentHotkey: ParsedHotkey | null = null // Keep parsed version for modifier release in sendCtrlCViaKeyTap
let priceCheckAccelerator: string | null = null
let chatCommandHotkeys: Array<{ accelerator: string; command: string }> = []
let onTrigger: (() => void) | null = null
let onPriceCheck: (() => void) | null = null
let onEscape: (() => void) | null = null
let hookStarted = false
let injecting = false
let stashScrollEnabled = false

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start the low-level keyboard hook (for Escape only) and register the trigger callback. */
export function startHotkeyListener(handler: () => void): void {
  onTrigger = handler

  // uiohook is only used for Escape (overlay close) and stash scroll - main hotkeys use globalShortcut
  uIOhook.on('keydown', (e) => {
    if (injecting) return
    if (e.keycode === UiohookKey.Escape && onEscape) {
      onEscape()
    }
  })

  // Stash tab scrolling: Ctrl+scroll outside stash grid -> arrow key taps
  uIOhook.on('wheel', (e) => {
    if (!stashScrollEnabled || !e.ctrlKey) return
    const tb = OverlayController.targetBounds
    if (!tb || !tb.width) return
    // Only act when cursor is inside the PoE window but outside the stash grid area
    if (e.x < tb.x || e.x > tb.x + tb.width || e.y < tb.y || e.y > tb.y + tb.height) return
    if (isStashGridArea(e.x, e.y, tb)) return
    if (e.rotation > 0) {
      uIOhook.keyTap(UiohookKey.ArrowRight)
    } else if (e.rotation < 0) {
      uIOhook.keyTap(UiohookKey.ArrowLeft)
    }
  })

  if (!hookStarted) {
    uIOhook.start()
    hookStarted = true
  }
}

/** Update the active hotkey using globalShortcut (suppresses key from reaching other apps). */
export function setHotkey(accelerator: string): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {}
  }
  currentAccelerator = accelerator
  currentHotkey = parseAccelerator(accelerator)
  try {
    globalShortcut.register(accelerator, () => {
      if (onTrigger) onTrigger()
    })
  } catch (e) {
    console.error(`[hotkeys] Failed to register hotkey "${accelerator}":`, e)
  }
}

export function setPriceCheckHotkey(accelerator: string): void {
  if (priceCheckAccelerator) {
    try {
      globalShortcut.unregister(priceCheckAccelerator)
    } catch {}
  }
  priceCheckAccelerator = accelerator
  try {
    globalShortcut.register(accelerator, () => {
      if (onPriceCheck) onPriceCheck()
    })
  } catch (e) {
    console.error(`[hotkeys] Failed to register price check hotkey "${accelerator}":`, e)
  }
}

export function setPriceCheckHandler(handler: (() => void) | null): void {
  onPriceCheck = handler
}

export function setEscapeHandler(handler: (() => void) | null): void {
  onEscape = handler
}

export function setChatCommands(commands: Array<{ hotkey: string; command: string }>): void {
  // Unregister previous chat command shortcuts
  for (const ch of chatCommandHotkeys) {
    try {
      globalShortcut.unregister(ch.accelerator)
    } catch {}
  }
  chatCommandHotkeys = []

  for (const c of commands) {
    if (!c.hotkey || !c.command) continue
    try {
      globalShortcut.register(c.hotkey, () => {
        if (OverlayController.targetHasFocus) sendChatCommand(c.command)
      })
      chatCommandHotkeys.push({ accelerator: c.hotkey, command: c.command })
    } catch (e) {
      console.error(`[hotkeys] Failed to register chat command "${c.hotkey}":`, e)
    }
  }
}

export function sendChatCommand(command: string): Promise<void> {
  // Release modifier keys before typing so held hotkey combos don't garble the chat message
  uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
  uIOhook.keyToggle(UiohookKey.Shift, 'up')
  uIOhook.keyToggle(UiohookKey.Alt, 'up')
  return new Promise((resolve, reject) => {
    const dir = app.getPath('userData')
    const script = join(dir, 'chatcmd.vbs')
    const cmd = command.startsWith('/') ? command : `/${command}`
    // Escape VBScript SendKeys special characters to prevent injection
    const safeCmd = cmd
      .replace(/[+^%~(){}[\]]/g, '{$&}') // Wrap SendKeys special chars in braces to send literally
      .replace(/"/g, '""') // Escape double quotes for VBScript string
    writeFileSync(
      script,
      [
        'Set WshShell = CreateObject("WScript.Shell")',
        'WshShell.AppActivate "Path of Exile"',
        'WScript.Sleep 50',
        `WshShell.SendKeys "{ENTER}${safeCmd}{ENTER}"`,
      ].join('\n'),
    )
    execFile('cscript', ['//Nologo', '//B', script], (err) => {
      if (err) {
        console.error('[hotkeys] Failed to send chat command:', err)
        reject(err)
        return
      }
      resolve()
    })
  })
}

export function stopHotkeyListener(): void {
  if (hookStarted) {
    uIOhook.stop()
    hookStarted = false
  }
  globalShortcut.unregisterAll()
}

export function setStashScrollEnabled(enabled: boolean): void {
  stashScrollEnabled = enabled
}

// PoE stash grid area (physical pixels) - if cursor is here, don't intercept scroll
const POE_SIDEBAR_RATIO = 370 / 600
function isStashGridArea(x: number, y: number, tb: { x: number; y: number; width: number; height: number }): boolean {
  const sidebarWidth = tb.height * POE_SIDEBAR_RATIO
  if (x > tb.x + sidebarWidth) return false
  const gridTop = tb.y + (tb.height * 154) / 1600
  const gridBottom = tb.y + (tb.height * 1192) / 1600
  return y > gridTop && y < gridBottom
}

// ─── Ctrl+C sender ───────────────────────────────────────────────────────────

// ─── PoE chat command sender ─────────────────────────────────────────────────

let reloadFilterScript: string | null = null

function getReloadFilterScript(): string {
  if (reloadFilterScript && existsSync(reloadFilterScript)) return reloadFilterScript
  const dir = app.getPath('userData')
  reloadFilterScript = join(dir, 'reloadfilter.vbs')
  // Activate PoE, open chat with Enter, type command, send Enter
  writeFileSync(
    reloadFilterScript,
    [
      'Set WshShell = CreateObject("WScript.Shell")',
      'WshShell.AppActivate "Path of Exile"',
      'WScript.Sleep 100',
      'WshShell.SendKeys "{ENTER}/reloaditemfilter{ENTER}"',
    ].join('\n'),
  )
  return reloadFilterScript
}

/**
 * Send /reloaditemfilter to PoE's chat to reload the loot filter in-game.
 */
export function sendReloadFilterToPoE(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = getReloadFilterScript()
    execFile('cscript', ['//Nologo', '//B', script], (err) => {
      if (err) {
        console.error('[hotkeys] Failed to send reload command:', err)
        reject(err)
        return
      }
      resolve()
    })
  })
}

/**
 * Send /itemfilter {name} to PoE's chat to switch the active filter in-game.
 */
export function sendItemFilterCommand(filterName: string, currentFilter?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = app.getPath('userData')
    const script = join(dir, 'itemfilter.vbs')
    const lines = [
      'Set WshShell = CreateObject("WScript.Shell")',
      'WshShell.AppActivate "Path of Exile"',
      'WScript.Sleep 100',
    ]
    if (currentFilter) {
      // Switch to the current filter first to force PoE to rescan its filter directory,
      // so it discovers the newly created file before we switch to it
      lines.push(`WshShell.SendKeys "{ENTER}/itemfilter ${currentFilter}{ENTER}"`)
      lines.push('WScript.Sleep 500')
    }
    lines.push(`WshShell.SendKeys "{ENTER}/itemfilter ${filterName}{ENTER}"`)
    writeFileSync(script, lines.join('\n'))
    execFile('cscript', ['//Nologo', '//B', script], (err) => {
      if (err) {
        console.error('[hotkeys] Failed to send itemfilter command:', err)
        reject(err)
        return
      }
      resolve()
    })
  })
}

// ─── Ctrl+C sender ───────────────────────────────────────────────────────────

// Use a tiny VBScript for speed — cscript starts much faster than PowerShell
let sendKeysScript: string | null = null

function getSendKeysScript(): string {
  if (sendKeysScript && existsSync(sendKeysScript)) return sendKeysScript
  const dir = app.getPath('userData')
  sendKeysScript = join(dir, 'sendctrlc.vbs')
  writeFileSync(sendKeysScript, 'Set WshShell = CreateObject("WScript.Shell")\nWshShell.SendKeys "^%c"\n')
  return sendKeysScript
}

/**
 * Send Ctrl+C to whichever window currently has OS focus (i.e. PoE).
 * Uses cscript + VBScript for minimal startup latency (~50ms vs ~500ms for PowerShell).
 * Returns a promise that resolves after PoE has had time to populate the clipboard.
 */
export function sendCtrlCToActiveWindow(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = getSendKeysScript()
    execFile('cscript', ['//Nologo', '//B', script], (err) => {
      if (err) {
        console.error('[hotkeys] Failed to send Ctrl+C:', err)
        reject(err)
        return
      }
      // Give PoE ~150ms to process the keypress and write to clipboard
      setTimeout(resolve, 150)
    })
  })
}

/**
 * Fallback Ctrl+C for windowed mode where VBScript SendKeys can't reach PoE.
 * Uses uiohook keyTap (OS-level SendInput) after the caller focuses PoE via
 * OverlayController.focusTarget().
 *
 * Releases modifier keys the user is physically holding (from the hotkey combo)
 * so PoE receives a clean Ctrl+C. Does NOT re-press them afterward -- the OS
 * tracks physical key state, so the user releasing keys naturally is sufficient.
 * Re-pressing caused stuck modifier keys.
 */
export function sendCtrlCViaKeyTap(): Promise<void> {
  injecting = true

  // Release modifier keys the user is holding from their hotkey so PoE
  // receives a clean Ctrl+C (not e.g. Ctrl+Shift+C).
  if (currentHotkey?.shift) uIOhook.keyToggle(UiohookKey.Shift, 'up')
  if (currentHotkey?.alt) uIOhook.keyToggle(UiohookKey.Alt, 'up')

  // Always explicitly send Ctrl+Alt down/up -- after focusGameWindow() the new
  // foreground window doesn't inherit the modifier state from the old one,
  // even if the user is physically holding Ctrl.
  uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
  uIOhook.keyToggle(UiohookKey.Alt, 'down')
  uIOhook.keyTap(UiohookKey.C)
  uIOhook.keyToggle(UiohookKey.Alt, 'up')
  uIOhook.keyToggle(UiohookKey.Ctrl, 'up')

  return new Promise((resolve) =>
    setTimeout(() => {
      injecting = false
      resolve()
    }, 50),
  )
}
