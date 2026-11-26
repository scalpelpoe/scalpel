import * as fs from 'node:fs'
import { join } from 'node:path'
import { reportBreadcrumb, reportDiagnostic } from '../../../common/diagnostics'
import { Key } from '../../../common/input'
import type { GlobalShortcuts } from '../../../types'
import { evdevToUiohook } from '../native-input'

export interface KeyCombo {
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
}

const LETTER_KEYS: Record<string, number> = Object.fromEntries(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, Key[c as keyof typeof Key]]),
)
const EXTRA_KEYS: Record<string, number> = {
  F1: Key.F1,
  F2: Key.F2,
  F3: Key.F3,
  F4: Key.F4,
  F5: Key.F5,
  F6: Key.F6,
  F7: Key.F7,
  F8: Key.F8,
  F9: Key.F9,
  F10: Key.F10,
  F11: Key.F11,
  F12: Key.F12,
  Space: Key.Space,
  Tab: Key.Tab,
  Escape: Key.Escape,
  Delete: Key.Delete,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  '0': Key['0'],
  '1': Key['1'],
  '2': Key['2'],
  '3': Key['3'],
  '4': Key['4'],
  '5': Key['5'],
  '6': Key['6'],
  '7': Key['7'],
  '8': Key['8'],
  '9': Key['9'],
}
const KEY_MAP: Record<string, number> = { ...LETTER_KEYS, ...EXTRA_KEYS }
const MODIFIER_PREFIX = /^(CommandOrControl|Control|Ctrl|Command|Shift|Alt|Option)\+/

/** @internal Shared with the native layer-shell shortcut transport. */
export function parseLinuxAccelerator(accelerator: string): KeyCombo | null {
  let ctrl = false
  let shift = false
  let alt = false
  let rest = accelerator.replace(/\s+/g, '')
  let match = rest.match(MODIFIER_PREFIX)
  while (match) {
    const mod = match[1]
    if (mod === 'Shift') shift = true
    else if (mod === 'Alt' || mod === 'Option') alt = true
    else ctrl = true
    rest = rest.slice(match[0].length)
    match = rest.match(MODIFIER_PREFIX)
  }
  const keycode = KEY_MAP[rest] ?? 0
  return keycode ? { keycode, ctrl, shift, alt } : null
}

const EVDEV_MODIFIERS = {
  ctrl: new Set([29, 97]),
  shift: new Set([42, 54]),
  alt: new Set([56, 100]),
}
const MODIFIER_CODES = new Set([...EVDEV_MODIFIERS.ctrl, ...EVDEV_MODIFIERS.shift, ...EVDEV_MODIFIERS.alt])

function hasKeyboardKeys(capabilitiesKeyPath: string): boolean {
  try {
    const raw = fs.readFileSync(capabilitiesKeyPath, 'utf8').trim()
    if (!raw) return false
    // Hex bitmap, space-separated 64-bit chunks, most-significant first.
    const chunks = raw.split(/\s+/).map((c) => BigInt(`0x${c}`))
    let bits = 0n
    for (const chunk of chunks) bits = (bits << 64n) | chunk
    // Require KEY_ESC(1) and KEY_A(30) as a simple keyboard heuristic.
    return (bits & (1n << 1n)) !== 0n && (bits & (1n << 30n)) !== 0n
  } catch {
    return false
  }
}

function discoverKeyboardDevices(): string[] {
  const dir = '/dev/input'
  let entries: string[] = []
  try {
    entries = fs
      .readdirSync(dir)
      .filter((e) => /^event\d+$/.test(e))
      .sort()
  } catch (error) {
    reportDiagnostic('evdev-shortcuts:discover', error)
    return []
  }
  const devices: string[] = []
  for (const entry of entries) {
    const capPath = join('/sys/class/input', entry, 'device/capabilities/key')
    if (hasKeyboardKeys(capPath)) devices.push(join(dir, entry))
  }
  return devices
}

/** Whether this user can read at least one keyboard device. */
export function evdevKeyboardsReadable(): boolean {
  return discoverKeyboardDevices().some((device) => {
    try {
      fs.accessSync(device, fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  })
}

/** Standalone evdev global shortcuts. Reads /dev/input/event* keyboard devices
 *  directly, so it works on native Wayland without the electron-overlay-window
 *  addon. Requires read access to input devices (typically `input` group). */
export function createEvdevShortcuts(): GlobalShortcuts & { available(): boolean } {
  const bindings = new Map<string, { combo: KeyCombo; callback: () => void }>()
  const mods = { ctrlKey: false, shiftKey: false, altKey: false }
  const streams: Array<{ destroy(): void }> = []
  let started = false
  let unavailableReason: string | null = null
  let loggedFirstEvent = false

  function stop(): void {
    for (const stream of streams) {
      try {
        stream.destroy()
      } catch {
        // A device removed while open can throw on destroy; it is closed either way.
      }
    }
    streams.length = 0
    started = false
  }

  function dispatch(keycode: number | null): boolean {
    let matched = false
    for (const [accelerator, { combo, callback }] of bindings) {
      if (
        combo.keycode === keycode &&
        combo.ctrl === mods.ctrlKey &&
        combo.shift === mods.shiftKey &&
        combo.alt === mods.altKey
      ) {
        matched = true
        reportBreadcrumb(
          `evdev shortcut matched accelerator="${accelerator}" keycode=${keycode} ctrl=${mods.ctrlKey} shift=${mods.shiftKey} alt=${mods.altKey}`,
          'debug',
        )
        try {
          callback()
        } catch (error) {
          reportDiagnostic('evdev-shortcuts:callback', error)
        }
      }
    }
    return matched
  }

  function handleEvent(buf: Buffer, size: 16 | 24, dev: string): void {
    for (let off = 0; off + size <= buf.length; off += size) {
      const type = buf.readUInt16LE(off + (size === 24 ? 16 : 8))
      if (type !== 1) continue // EV_KEY
      const code = buf.readUInt16LE(off + (size === 24 ? 18 : 10))
      const value = buf.readInt32LE(off + (size === 24 ? 20 : 12))
      const pressed = value !== 0
      if (EVDEV_MODIFIERS.ctrl.has(code)) mods.ctrlKey = pressed
      else if (EVDEV_MODIFIERS.shift.has(code)) mods.shiftKey = pressed
      else if (EVDEV_MODIFIERS.alt.has(code)) mods.altKey = pressed
      if (!loggedFirstEvent) {
        // One line proves the device stream is live; per-key detail is noise
        // even at debug level. Matched accelerators are logged in dispatch().
        loggedFirstEvent = true
        reportBreadcrumb(`evdev events flowing dev=${dev}`, 'debug')
      }
      if (!pressed || value !== 1 || MODIFIER_CODES.has(code)) continue
      dispatch(evdevToUiohook(code))
    }
  }

  function start(): void {
    if (started || unavailableReason) return
    const devices = discoverKeyboardDevices()
    if (devices.length === 0) {
      unavailableReason = 'no keyboard evdev devices found/readable'
      reportBreadcrumb(`evdev shortcuts unavailable: ${unavailableReason}`)
      return
    }
    started = true
    let opened = 0
    for (const dev of devices) {
      try {
        const fd = fs.openSync(dev, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
        let rawChunks = 0
        let closed = false
        const buf = Buffer.allocUnsafe(24 * 64)
        const readLoop = () => {
          if (closed) return
          fs.read(fd, buf, 0, buf.length, null, (err, bytesRead) => {
            if (closed) return
            if (err) {
              const code = (err as NodeJS.ErrnoException).code
              if (code === 'EAGAIN' || code === 'EWOULDBLOCK') {
                setTimeout(readLoop, 10)
                return
              }
              reportDiagnostic('evdev-shortcuts:read', err)
              try {
                fs.closeSync(fd)
              } catch {}
              return
            }
            if (bytesRead > 0) {
              if (rawChunks < 6) {
                rawChunks++
                reportBreadcrumb(`evdev raw dev=${dev} bytes=${bytesRead}`, 'debug')
              }
              const b = buf.subarray(0, bytesRead)
              const size: 16 | 24 = b.length % 24 === 0 ? 24 : 16
              const usable = Math.floor(b.length / size) * size
              if (usable > 0) handleEvent(b.subarray(0, usable), size, dev)
              setImmediate(readLoop)
              return
            }
            setTimeout(readLoop, 10)
          })
        }
        streams.push({
          destroy() {
            closed = true
            try {
              fs.closeSync(fd)
            } catch {}
          },
        })
        readLoop()
        opened++
      } catch (error) {
        reportDiagnostic('evdev-shortcuts:open', error)
      }
    }
    reportBreadcrumb(`evdev shortcuts started devices=${opened}/${devices.length} paths=${devices.join(',')}`)
    if (opened === 0) {
      unavailableReason = 'no evdev devices could be opened'
      started = false
    }
  }

  return {
    available() {
      if (unavailableReason) return false
      if (started) return streams.length > 0
      // Probe lightly: if no keyboard devices, unavailable.
      return discoverKeyboardDevices().length > 0
    },
    register(accelerator, callback) {
      if (unavailableReason) return false
      if (bindings.has(accelerator)) return false
      const combo = parseLinuxAccelerator(accelerator)
      if (!combo) {
        reportBreadcrumb(`evdev shortcut parse failed accelerator="${accelerator}"`)
        return false
      }
      bindings.set(accelerator, { combo, callback })
      reportBreadcrumb(
        `evdev shortcut registered accelerator="${accelerator}" keycode=${combo.keycode} ctrl=${combo.ctrl} shift=${combo.shift} alt=${combo.alt}`,
      )
      start()
      if (unavailableReason) {
        bindings.delete(accelerator)
        return false
      }
      return true
    },
    unregister(accelerator) {
      bindings.delete(accelerator)
      if (bindings.size === 0) stop()
    },
    unregisterAll() {
      bindings.clear()
      stop()
    },
    isRegistered(accelerator) {
      return bindings.has(accelerator)
    },
  }
}
