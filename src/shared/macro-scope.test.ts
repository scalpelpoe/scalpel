import { describe, expect, it } from 'vitest'
import {
  chatCommandScope,
  appMacroScope,
  chatCommandEffectiveScope,
  appMacroEffectiveScope,
  scopeAppliesTo,
} from './macro-scope'

describe('chatCommandScope', () => {
  it('returns poe1 for each of the four PoE1-only commands', () => {
    expect(chatCommandScope('/menagerie')).toBe('poe1')
    expect(chatCommandScope('/delve')).toBe('poe1')
    expect(chatCommandScope('/kingsmarch')).toBe('poe1')
    expect(chatCommandScope('/monastery')).toBe('poe1')
  })

  it('is case-insensitive', () => {
    expect(chatCommandScope('/Menagerie')).toBe('poe1')
    expect(chatCommandScope('/DELVE')).toBe('poe1')
    expect(chatCommandScope('/KingsMarch')).toBe('poe1')
    expect(chatCommandScope('/Monastery')).toBe('poe1')
  })

  it('is whitespace-insensitive', () => {
    expect(chatCommandScope('  /menagerie  ')).toBe('poe1')
    expect(chatCommandScope(' /delve')).toBe('poe1')
  })

  it('returns both for non-PoE1-only commands', () => {
    expect(chatCommandScope('/hideout')).toBe('both')
    expect(chatCommandScope('/reloaditemfilter')).toBe('both')
    expect(chatCommandScope('')).toBe('both')
    expect(chatCommandScope('my custom command')).toBe('both')
    expect(chatCommandScope('@last')).toBe('both')
  })
})

describe('appMacroScope', () => {
  it('returns poe1 for openDust, openDivCards, and openScarabs', () => {
    expect(appMacroScope('openDust')).toBe('poe1')
    expect(appMacroScope('openDivCards')).toBe('poe1')
    expect(appMacroScope('openScarabs')).toBe('poe1')
  })

  it('returns both for all other known app macro action ids', () => {
    const bothActions = [
      'openSettings',
      'openAudit',
      'openRegex',
      'openWiki',
      'openPoeDb',
      'pasteRegex',
      'useSavedRegex',
      'closeOverlay',
      'toggleWhiteboard',
    ]
    for (const id of bothActions) {
      expect(appMacroScope(id)).toBe('both')
    }
  })

  it('returns both for unknown action ids', () => {
    expect(appMacroScope('someNewFutureAction')).toBe('both')
    expect(appMacroScope('')).toBe('both')
  })
})

describe('scopeAppliesTo', () => {
  it('both applies to game 1', () => {
    expect(scopeAppliesTo('both', 1)).toBe(true)
  })

  it('both applies to game 2', () => {
    expect(scopeAppliesTo('both', 2)).toBe(true)
  })

  it('poe1 applies to game 1', () => {
    expect(scopeAppliesTo('poe1', 1)).toBe(true)
  })

  it('poe1 does not apply to game 2', () => {
    expect(scopeAppliesTo('poe1', 2)).toBe(false)
  })

  it('poe2 applies to game 2', () => {
    expect(scopeAppliesTo('poe2', 2)).toBe(true)
  })

  it('poe2 does not apply to game 1', () => {
    expect(scopeAppliesTo('poe2', 1)).toBe(false)
  })
})

describe('chatCommandEffectiveScope', () => {
  it('uses explicit override when present', () => {
    expect(chatCommandEffectiveScope({ command: '/hideout', scope: 'poe2' })).toBe('poe2')
    expect(chatCommandEffectiveScope({ command: '/kingsmarch', scope: 'poe2' })).toBe('poe2')
  })

  it('falls back to inferred scope when override is absent', () => {
    expect(chatCommandEffectiveScope({ command: '/hideout' })).toBe('both')
    expect(chatCommandEffectiveScope({ command: '/kingsmarch' })).toBe('poe1')
  })
})

describe('appMacroEffectiveScope', () => {
  it('uses explicit override when present', () => {
    expect(appMacroEffectiveScope({ action: 'openRegex', scope: 'poe2' })).toBe('poe2')
    expect(appMacroEffectiveScope({ action: 'openDust', scope: 'poe2' })).toBe('poe2')
  })

  it('falls back to inferred scope when override is absent', () => {
    expect(appMacroEffectiveScope({ action: 'openRegex' })).toBe('both')
    expect(appMacroEffectiveScope({ action: 'openDust' })).toBe('poe1')
  })
})
