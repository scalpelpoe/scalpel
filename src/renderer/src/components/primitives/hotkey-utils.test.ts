import { describe, expect, it } from 'vitest'
import { keyEventToAccelerator, prettyHotkey } from './hotkey-utils'

// keyEventToAccelerator only reads a handful of properties off the event, so a
// plain object cast to KeyboardEvent is a faithful fixture (no jsdom needed).
function ev(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...partial } as KeyboardEvent
}

describe('keyEventToAccelerator', () => {
  it('leaves plain letters as uppercase electron accelerators', () => {
    expect(keyEventToAccelerator(ev({ key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+F',
    )
  })

  it('leaves digits and named keys untouched', () => {
    expect(keyEventToAccelerator(ev({ key: '5', code: 'Digit5' }))).toBe('5')
    expect(keyEventToAccelerator(ev({ key: ' ', code: 'Space' }))).toBe('Space')
    expect(keyEventToAccelerator(ev({ key: 'F8', code: 'F8' }))).toBe('F8')
  })

  it('encodes the Danish æ key by physical position with its glyph', () => {
    // Danish æ sits on the US Semicolon position
    expect(keyEventToAccelerator(ev({ key: 'æ', code: 'Semicolon', ctrlKey: true }))).toBe(
      'CommandOrControl+Phys:Semicolon:Æ',
    )
  })

  it('encodes US punctuation by physical position too', () => {
    expect(keyEventToAccelerator(ev({ key: ';', code: 'Semicolon' }))).toBe('Phys:Semicolon:;')
    expect(keyEventToAccelerator(ev({ key: '/', code: 'Slash', altKey: true }))).toBe('Alt+Phys:Slash:/')
  })

  it('returns null for a bare modifier press', () => {
    expect(keyEventToAccelerator(ev({ key: 'Shift', shiftKey: true }))).toBeNull()
  })

  it('encodes a numpad digit by code, with NumLock on', () => {
    expect(keyEventToAccelerator(ev({ key: '2', code: 'Numpad2' }))).toBe('num2')
    expect(keyEventToAccelerator(ev({ key: '2', code: 'Numpad2', ctrlKey: true }))).toBe('CommandOrControl+num2')
  })

  it('encodes numpad add and decimal (including locale comma) by code', () => {
    expect(keyEventToAccelerator(ev({ key: '+', code: 'NumpadAdd' }))).toBe('numadd')
    expect(keyEventToAccelerator(ev({ key: ',', code: 'NumpadDecimal' }))).toBe('numdec')
  })

  it('records NumLock-off numpad presses as their named navigation key', () => {
    expect(keyEventToAccelerator(ev({ key: 'ArrowDown', code: 'Numpad2' }))).toBe('Down')
  })

  it('leaves top-row digits unaffected by the numpad code check', () => {
    expect(keyEventToAccelerator(ev({ key: '2', code: 'Digit2' }))).toBe('2')
  })
})

describe('prettyHotkey', () => {
  it('renders CommandOrControl as Ctrl', () => {
    expect(prettyHotkey('CommandOrControl+Shift+F')).toBe('Ctrl+Shift+F')
  })

  it('renders a physical token as its captured glyph', () => {
    expect(prettyHotkey('CommandOrControl+Phys:Semicolon:Æ')).toBe('Ctrl+Æ')
    expect(prettyHotkey('Phys:Slash:/')).toBe('/')
  })

  it('renders a physical token whose glyph is a plus sign', () => {
    expect(prettyHotkey('Alt+Phys:Equal:+')).toBe('Alt++')
  })

  it('passes plain accelerators through', () => {
    expect(prettyHotkey('F8')).toBe('F8')
    expect(prettyHotkey('')).toBe('')
  })

  it('renders a numpad token with its display label', () => {
    expect(prettyHotkey('num2')).toBe('Num 2')
    expect(prettyHotkey('CommandOrControl+Shift+numadd')).toBe('Ctrl+Shift+Num +')
  })
})
