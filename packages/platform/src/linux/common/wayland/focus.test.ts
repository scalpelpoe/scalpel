import { describe, expect, it } from 'vitest'
import { activatedEntry, matchesWaylandGameToplevel } from './focus'

describe('Wayland game toplevel matching', () => {
  it('accepts a native PoE window by title, app id, or known wrapper', () => {
    expect(matchesWaylandGameToplevel('Path of Exile', null)).toBe(true)
    expect(matchesWaylandGameToplevel('Path of Exile 2', 'pathofexilesteam.exe')).toBe(true)
    expect(matchesWaylandGameToplevel('Path of Exile 2', 'steam_app_2694490')).toBe(true)
    expect(matchesWaylandGameToplevel(null, 'com.poe.game')).toBe(true)
    expect(matchesWaylandGameToplevel('Path of Exile 2 (GOG)', 'wine')).toBe(true)
  })

  it('rejects launcher windows, utility windows, and untrusted titles', () => {
    expect(matchesWaylandGameToplevel('Path of Exile', 'steam.exe')).toBe(false)
    expect(matchesWaylandGameToplevel('Path of Exile Trade', null)).toBe(false)
    expect(matchesWaylandGameToplevel('Path of Exile', 'com.example.Other')).toBe(false)
    expect(matchesWaylandGameToplevel('Terminal', 'com.example.Other')).toBe(false)
    expect(matchesWaylandGameToplevel(null, null)).toBe(false)
  })
})

describe('zwlr activated toplevel selection', () => {
  it('returns null when no toplevel is activated (a layer surface holds focus)', () => {
    expect(activatedEntry<number, { active: boolean }>([])).toBeNull()
    expect(
      activatedEntry([
        [1, { active: false }],
        [2, { active: false }],
      ]),
    ).toBeNull()
  })

  it('returns the activated toplevel entry', () => {
    const active = { active: true }
    expect(
      activatedEntry([
        [1, { active: false }],
        [2, active],
      ]),
    ).toEqual([2, active])
  })
})
