import { UiohookKey } from 'uiohook-napi'
import { describe, expect, it } from 'vitest'
import { NUMPAD_CODE_TO_TOKEN } from '@shared/hotkey-tokens'
import { isElectronRegisterable, parseAccelerator } from './hotkey-accelerator'

describe('parseAccelerator', () => {
  it('parses a plain modified letter', () => {
    expect(parseAccelerator('CommandOrControl+Shift+F')).toEqual({
      keycode: UiohookKey.F,
      ctrl: true,
      shift: true,
      alt: false,
    })
  })

  it('parses a function key', () => {
    expect(parseAccelerator('F8')).toEqual({ keycode: UiohookKey.F8, ctrl: false, shift: false, alt: false })
  })

  it('resolves a Danish æ physical token to the Semicolon keycode', () => {
    expect(parseAccelerator('CommandOrControl+Phys:Semicolon:Æ')).toEqual({
      keycode: UiohookKey.Semicolon,
      ctrl: true,
      shift: false,
      alt: false,
    })
  })

  it('resolves an ø physical token to the Quote keycode', () => {
    expect(parseAccelerator('Phys:Quote:Ø')).toEqual({
      keycode: UiohookKey.Quote,
      ctrl: false,
      shift: false,
      alt: false,
    })
  })

  it('parses a physical token whose glyph is a plus sign', () => {
    expect(parseAccelerator('Alt+Phys:Equal:+')).toEqual({
      keycode: UiohookKey.Equal,
      ctrl: false,
      shift: false,
      alt: true,
    })
  })

  it('returns null for an unmapped physical code', () => {
    expect(parseAccelerator('Phys:Nonsense:x')).toBeNull()
  })

  it('returns null for a bare unmapped character (legacy international value)', () => {
    expect(parseAccelerator('Æ')).toBeNull()
  })

  it('returns null for the empty string', () => {
    expect(parseAccelerator('')).toBeNull()
  })

  it('resolves a numpad token to its uiohook keycode', () => {
    expect(parseAccelerator('num2')).toEqual({
      keycode: UiohookKey.Numpad2,
      ctrl: false,
      shift: false,
      alt: false,
    })
  })

  it('resolves a modified numpad token', () => {
    const combo = parseAccelerator('Ctrl+numdiv')
    expect(combo?.keycode).toBe(UiohookKey.NumpadDivide)
    expect(combo?.ctrl).toBe(true)
  })

  it('parses every numpad token to a non-null combo', () => {
    for (const token of Object.values(NUMPAD_CODE_TO_TOKEN)) {
      expect(parseAccelerator(token)).not.toBeNull()
    }
  })
})

describe('isElectronRegisterable', () => {
  it('is true for accelerators globalShortcut can bind', () => {
    expect(isElectronRegisterable('CommandOrControl+Shift+F')).toBe(true)
    expect(isElectronRegisterable('F8')).toBe(true)
  })

  it('is false for physical tokens electron cannot bind', () => {
    expect(isElectronRegisterable('CommandOrControl+Phys:Semicolon:Æ')).toBe(false)
    expect(isElectronRegisterable('Phys:Quote:Ø')).toBe(false)
  })

  it('is false even when the physical token glyph is a plus sign', () => {
    expect(isElectronRegisterable('Alt+Phys:Equal:+')).toBe(false)
  })

  it('is true for numpad tokens', () => {
    expect(isElectronRegisterable('num2')).toBe(true)
  })
})
