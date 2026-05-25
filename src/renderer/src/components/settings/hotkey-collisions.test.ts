import { describe, expect, it } from 'vitest'
import { findHotkeyCollision, narrowScopeForCrossGameConflict } from './hotkey-collisions'
import type { RuntimeSettings } from '../../../../shared/types'

function makeSettings(overrides: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    hotkey: '',
    priceCheckHotkey: '',
    chatCommands: [],
    appMacros: [],
    activeProfile: null,
    ...overrides,
  } as RuntimeSettings
}

describe('findHotkeyCollision - scope-aware', () => {
  it('does not collide in PoE2 when the existing entry is PoE1-only', () => {
    const settings = makeSettings({
      chatCommands: [
        { hotkey: 'F5', command: '/kingsmarch', autoSubmit: true },
        { hotkey: '', command: '/hideout', autoSubmit: true },
      ],
    })
    // In PoE2, /kingsmarch is invisible, so F5 is free for /hideout to claim
    const result = findHotkeyCollision(settings, 'F5', { kind: 'chat', index: 1 }, 2)
    expect(result).toBeNull()
  })

  it('collides in PoE1 when both entries are visible', () => {
    const settings = makeSettings({
      chatCommands: [
        { hotkey: 'F5', command: '/kingsmarch', autoSubmit: true },
        { hotkey: '', command: '/hideout', autoSubmit: true },
      ],
    })
    const result = findHotkeyCollision(settings, 'F5', { kind: 'chat', index: 1 }, 1)
    expect(result).not.toBeNull()
  })

  it('collides in PoE1 between two poe1-only entries; no collision in PoE2 (both filtered out)', () => {
    const settings = makeSettings({
      chatCommands: [
        { hotkey: 'F5', command: '/kingsmarch', autoSubmit: true },
        { hotkey: '', command: '/menagerie', autoSubmit: true },
      ],
    })
    expect(findHotkeyCollision(settings, 'F5', { kind: 'chat', index: 1 }, 1)).not.toBeNull()
    expect(findHotkeyCollision(settings, 'F5', { kind: 'chat', index: 1 }, 2)).toBeNull()
  })

  it('does not collide in PoE2 when the existing app macro is PoE1-only', () => {
    const settings = makeSettings({
      appMacros: [
        { action: 'openDust', hotkey: 'F6' },
        { action: 'openRegex', hotkey: '' },
      ],
    })
    const result = findHotkeyCollision(settings, 'F6', { kind: 'appmacro', index: 1 }, 2)
    expect(result).toBeNull()
  })

  it('collides between filter hotkey and any visible chat macro in the same game', () => {
    const settings = makeSettings({
      hotkey: 'F5',
      chatCommands: [{ hotkey: '', command: '/hideout', autoSubmit: true }],
    })
    const result = findHotkeyCollision(settings, 'F5', { kind: 'chat', index: 0 }, 1)
    expect(result).not.toBeNull()
  })

  it('no self-collision when editing a poe1-only entry with its own hotkey', () => {
    const settings = makeSettings({
      chatCommands: [{ hotkey: 'F5', command: '/kingsmarch', autoSubmit: true }],
    })
    const result = findHotkeyCollision(settings, 'F5', { kind: 'chat', index: 0 }, 1)
    expect(result).toBeNull()
  })

  it('returns null for empty hotkey', () => {
    const settings = makeSettings({
      chatCommands: [{ hotkey: 'F5', command: '/kingsmarch', autoSubmit: true }],
    })
    const result = findHotkeyCollision(settings, '', { kind: 'chat', index: 1 }, 1)
    expect(result).toBeNull()
  })
})

describe('narrowScopeForCrossGameConflict', () => {
  it('narrows new PoE2 binding to poe2 when an existing PoE1-only entry holds the hotkey', () => {
    const settings = makeSettings({
      chatCommands: [
        { hotkey: 'F5', command: '/kingsmarch', autoSubmit: true },
        { hotkey: '', command: '/hideout', autoSubmit: true },
      ],
    })
    const result = narrowScopeForCrossGameConflict(settings, 'F5', { kind: 'chat', index: 1 }, 2)
    expect(result).toBe('poe2')
  })

  it('narrows new PoE1 binding to poe1 when an existing poe2-only entry holds the hotkey (via override)', () => {
    const settings = makeSettings({
      chatCommands: [
        { hotkey: 'F5', command: '/hideout', autoSubmit: true, scope: 'poe2' },
        { hotkey: '', command: '/reloaditemfilter', autoSubmit: true },
      ],
    })
    const result = narrowScopeForCrossGameConflict(settings, 'F5', { kind: 'chat', index: 1 }, 1)
    expect(result).toBe('poe1')
  })

  it('returns undefined when no other entry holds the hotkey', () => {
    const settings = makeSettings({
      chatCommands: [{ hotkey: '', command: '/hideout', autoSubmit: true }],
    })
    const result = narrowScopeForCrossGameConflict(settings, 'F5', { kind: 'chat', index: 0 }, 2)
    expect(result).toBeUndefined()
  })

  it('returns undefined when conflicting entry has scope "both" (same-game collision, not cross-game)', () => {
    const settings = makeSettings({
      chatCommands: [
        { hotkey: 'F5', command: '/hideout', autoSubmit: true },
        { hotkey: '', command: '/reloaditemfilter', autoSubmit: true },
      ],
    })
    const result = narrowScopeForCrossGameConflict(settings, 'F5', { kind: 'chat', index: 1 }, 2)
    expect(result).toBeUndefined()
  })

  it('does not narrow against the slot being edited (self)', () => {
    const settings = makeSettings({
      chatCommands: [{ hotkey: 'F5', command: '/kingsmarch', autoSubmit: true }],
    })
    const result = narrowScopeForCrossGameConflict(settings, 'F5', { kind: 'chat', index: 0 }, 2)
    expect(result).toBeUndefined()
  })

  it('narrows for app macro when PoE1-only app macro holds the hotkey', () => {
    const settings = makeSettings({
      appMacros: [
        { action: 'openDust', hotkey: 'F6' },
        { action: 'openRegex', hotkey: '' },
      ],
    })
    const result = narrowScopeForCrossGameConflict(settings, 'F6', { kind: 'appmacro', index: 1 }, 2)
    expect(result).toBe('poe2')
  })
})
