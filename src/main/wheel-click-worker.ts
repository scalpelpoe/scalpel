// worker_thread that turns scroll-wheel notches into left clicks while the
// chosen lock key (CapsLock or ScrollLock) is on and Path of Exile is focused
// (Windows only). Started and stopped by wheel-click.ts.
//
// Why a dedicated thread: a WH_MOUSE_LL hook is called for every mouse event
// system-wide and only on the thread that installed it, which must pump
// messages. On Electron's main thread any busy JS (a filter parse, a big IPC
// payload) would stall the whole desktop's cursor, and Windows silently drops
// hooks that miss LowLevelHooksTimeout. Here the thread does nothing but pump.
//
// Why not uiohook: it only observes - it can't swallow the wheel event, so PoE
// would still see the scroll (and flip stash tabs) alongside the click.
//
// This thread blocks inside GetMessageW for its whole life, so it never
// services postMessage. All coordination goes through the SharedArrayBuffer in
// workerData (see SLOT), and a 250ms thread timer wakes the loop to notice STOP.
import { parentPort, workerData } from 'node:worker_threads'
import koffi from 'koffi'
import {
  SLOT,
  STATUS,
  type NotchAccumulator,
  pointInBounds,
  takeNotches,
  toggleKeyVk,
  wheelDeltaFromMouseData,
} from './wheel-click-shared'

const WH_MOUSE_LL = 14
const HC_ACTION = 0
const WM_TIMER = 0x0113
const WM_MOUSEWHEEL = 0x020a
const WM_APP_CLICK = 0x8000 + 0x5c1
const LLMHF_INJECTED = 0x1
const SM_SWAPBUTTON = 23
const INPUT_MOUSE = 0
const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const MOUSEEVENTF_RIGHTDOWN = 0x0008
const MOUSEEVENTF_RIGHTUP = 0x0010
/** Tags our injected clicks so they're identifiable in a hook/debugger. */
const SCALPEL_EXTRA_INFO = 0x5c41
const STOP_POLL_MS = 250

const state = new Int32Array(workerData.buffer as SharedArrayBuffer)

function report(type: 'error' | 'stopped', detail?: string): void {
  try {
    parentPort?.postMessage({ type, detail })
  } catch {
    // Parent gone; nothing to tell.
  }
}

function run(): void {
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')

  const POINT = koffi.struct({ x: 'int32', y: 'int32' })
  const MSLLHOOKSTRUCT = koffi.struct({
    pt: POINT,
    mouseData: 'uint32',
    flags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr',
  })
  const MSG = koffi.struct({
    hwnd: 'void *',
    message: 'uint32',
    wParam: 'uintptr',
    lParam: 'intptr',
    time: 'uint32',
    pt: POINT,
    lPrivate: 'uint32',
  })
  const MOUSEINPUT = koffi.struct({
    dx: 'int32',
    dy: 'int32',
    mouseData: 'uint32',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr',
  })
  // INPUT is { DWORD type; union { MOUSEINPUT; KEYBDINPUT; HARDWAREINPUT } }.
  // MOUSEINPUT is the largest member, so this layout matches sizeof(INPUT).
  const INPUT = koffi.struct({ type: 'uint32', mi: MOUSEINPUT })

  const HookProc = koffi.proto('__stdcall', 'ScalpelWheelClickProc', 'intptr', ['int', 'uintptr', 'void *'])

  const SetWindowsHookExW = user32.func('__stdcall', 'SetWindowsHookExW', 'void *', [
    'int',
    koffi.pointer(HookProc),
    'void *',
    'uint32',
  ])
  const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'bool', ['void *'])
  const CallNextHookEx = user32.func('__stdcall', 'CallNextHookEx', 'intptr', ['void *', 'int', 'uintptr', 'void *'])
  const GetMessageW = user32.func('__stdcall', 'GetMessageW', 'int', [
    koffi.out(koffi.pointer(MSG)),
    'void *',
    'uint32',
    'uint32',
  ])
  const PostThreadMessageW = user32.func('__stdcall', 'PostThreadMessageW', 'bool', [
    'uint32',
    'uint32',
    'uintptr',
    'intptr',
  ])
  const SetTimer = user32.func('__stdcall', 'SetTimer', 'uintptr', ['void *', 'uintptr', 'uint32', 'void *'])
  const KillTimer = user32.func('__stdcall', 'KillTimer', 'bool', ['void *', 'uintptr'])
  const GetKeyState = user32.func('__stdcall', 'GetKeyState', 'int16', ['int'])
  const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int'])
  const SendInput = user32.func('__stdcall', 'SendInput', 'uint32', ['uint32', koffi.pointer(INPUT), 'int'])
  const GetModuleHandleW = kernel32.func('__stdcall', 'GetModuleHandleW', 'void *', ['void *'])
  const GetCurrentThreadId = kernel32.func('__stdcall', 'GetCurrentThreadId', 'uint32', [])

  const threadId = GetCurrentThreadId() as number
  const inputSize = koffi.sizeof(INPUT)
  const acc: NotchAccumulator = { carry: 0, lastAt: 0 }

  function toggleKeyOn(): boolean {
    // Toggle bit of the system-wide lock state; readable from a thread that
    // doesn't own the foreground input. Main keeps a valid VK in the slot;
    // 0 (not yet written) falls back to CapsLock.
    const vk = Atomics.load(state, SLOT.TOGGLE_VK) || toggleKeyVk(undefined)
    return ((GetKeyState(vk) as number) & 1) === 1
  }

  /** Decide (synchronously, inside the hook) whether this wheel event becomes
   *  clicks. Returns true when the event must be swallowed. */
  function handleWheel(lParam: unknown): boolean {
    if (Atomics.load(state, SLOT.ACTIVE) !== 1) return false
    const info = koffi.decode(lParam, MSLLHOOKSTRUCT) as {
      pt: { x: number; y: number }
      mouseData: number
      flags: number
    }
    // Leave synthetic wheels (other tools, Scalpel's own injections) alone.
    if (info.flags & LLMHF_INJECTED) return false
    const armed = toggleKeyOn()
    Atomics.store(state, SLOT.TOGGLE_ON, armed ? 1 : 0)
    if (!armed) return false
    const bounds = {
      x: Atomics.load(state, SLOT.X),
      y: Atomics.load(state, SLOT.Y),
      w: Atomics.load(state, SLOT.W),
      h: Atomics.load(state, SLOT.H),
    }
    // PoE can be focused while the cursor scrolls a window on another monitor;
    // a click there would land in that other window.
    if (!pointInBounds(info.pt.x, info.pt.y, bounds)) return false

    const clicks = takeNotches(acc, wheelDeltaFromMouseData(info.mouseData), Date.now())
    Atomics.add(state, SLOT.CONVERTED, 1)
    // Inject from the message loop rather than inside the hook callback, so
    // the hook returns immediately and the injected events don't re-enter it
    // mid-call.
    if (clicks > 0) PostThreadMessageW(threadId, WM_APP_CLICK, clicks, 0)
    return true
  }

  function sendClicks(count: number): void {
    // SendInput's LEFT flags are physical; honor a swapped primary button so
    // the click is the user's primary click either way.
    const swapped = (GetSystemMetrics(SM_SWAPBUTTON) as number) !== 0
    const down = swapped ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN
    const up = swapped ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP
    const inputs: unknown[] = []
    for (let i = 0; i < count; i++) {
      for (const dwFlags of [down, up]) {
        inputs.push({
          type: INPUT_MOUSE,
          mi: { dx: 0, dy: 0, mouseData: 0, dwFlags, time: 0, dwExtraInfo: SCALPEL_EXTRA_INFO },
        })
      }
    }
    const sent = SendInput(inputs.length, inputs, inputSize) as number
    Atomics.add(state, SLOT.CLICKS, Math.floor(sent / 2))
  }

  const proc = koffi.register((nCode: number, wParam: number, lParam: unknown) => {
    if (nCode === HC_ACTION && Number(wParam) === WM_MOUSEWHEEL) {
      try {
        if (handleWheel(lParam)) return 1
      } catch {
        // Never let a JS error eat input: fall through to the next hook.
      }
    }
    return CallNextHookEx(null, nCode, wParam, lParam)
  }, koffi.pointer(HookProc))

  const hook = SetWindowsHookExW(WH_MOUSE_LL, proc, GetModuleHandleW(null), 0)
  if (!hook) {
    koffi.unregister(proc)
    throw new Error('SetWindowsHookExW(WH_MOUSE_LL) failed')
  }
  const timer = SetTimer(null, 0, STOP_POLL_MS, null)
  Atomics.store(state, SLOT.STATUS, STATUS.RUNNING)

  try {
    const msg: { message?: number; wParam?: number } = {}
    while (Atomics.load(state, SLOT.STOP) !== 1) {
      const r = GetMessageW(msg, null, 0, 0) as number
      if (r === 0 || r === -1) break // WM_QUIT / error
      if (msg.message === WM_APP_CLICK) {
        // Re-check at injection time: focus may have left PoE in between.
        if (Atomics.load(state, SLOT.ACTIVE) === 1) sendClicks(Number(msg.wParam))
      } else if (msg.message === WM_TIMER) {
        // Wake-up only; the loop condition checks STOP.
      }
    }
  } finally {
    if (timer) KillTimer(null, timer)
    UnhookWindowsHookEx(hook)
    koffi.unregister(proc)
  }
}

try {
  run()
  Atomics.store(state, SLOT.STATUS, STATUS.STOPPED)
  report('stopped')
} catch (e) {
  Atomics.store(state, SLOT.STATUS, STATUS.FAILED)
  report('error', String(e))
}
