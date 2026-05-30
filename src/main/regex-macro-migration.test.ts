import { describe, it, expect } from 'vitest'
import { migrateAppMacros } from './regex-macro-migration'
import type { AppSettings, RegexPreset } from '../shared/types'

type Macro = AppSettings['appMacros'][number]
const preset = (id: string, tagText: string): RegexPreset => ({
  id,
  tags: [{ text: tagText }] as never,
  avoid: [],
  want: [],
  wantMode: 'any',
  qualifiers: {},
  nightmare: false,
  regex: '',
})

describe('migrateAppMacros', () => {
  it('resolves a legacy tag binding to presetId and drops the tag', () => {
    const macros: Macro[] = [{ action: 'useSavedRegex', hotkey: 'Alt+1', tag: 'macro maps' }]
    const presets = [preset('p1', 'macro maps')]
    const { macros: out, changed } = migrateAppMacros(macros, presets, [])
    expect(changed).toBe(true)
    expect(out[0]).toEqual({ action: 'useSavedRegex', hotkey: 'Alt+1', presetId: 'p1' })
  })
  it('searches both game slots', () => {
    const macros: Macro[] = [{ action: 'useSavedRegex', hotkey: 'Alt+2', tag: 'ws' }]
    const { macros: out } = migrateAppMacros(macros, [], [preset('p2', 'ws')])
    expect(out[0].presetId).toBe('p2')
  })
  it('leaves entries that already have presetId untouched', () => {
    const macros: Macro[] = [{ action: 'useSavedRegex', hotkey: 'Alt+1', presetId: 'p1' }]
    const { changed } = migrateAppMacros(macros, [preset('p1', 'x')], [])
    expect(changed).toBe(false)
  })
  it('leaves unresolvable tag bindings untouched', () => {
    const macros: Macro[] = [{ action: 'useSavedRegex', hotkey: 'Alt+1', tag: 'gone' }]
    const { macros: out, changed } = migrateAppMacros(macros, [], [])
    expect(changed).toBe(false)
    expect(out[0].tag).toBe('gone')
  })
  it('ignores non-useSavedRegex actions', () => {
    const macros: Macro[] = [{ action: 'pasteRegex', hotkey: 'Alt+1' }]
    const { changed } = migrateAppMacros(macros, [], [])
    expect(changed).toBe(false)
  })
})
