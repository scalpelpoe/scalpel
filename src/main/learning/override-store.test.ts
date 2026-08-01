import { describe, it, expect } from 'vitest'
import { OverrideStore, type OverridePersistence } from './override-store'

function fakePersistence(): OverridePersistence & { saves: number } {
  const state = { data: {} as Record<string, Record<string, boolean>>, saves: 0 }
  return {
    get saves() {
      return state.saves
    },
    load: () => state.data,
    save: (d) => {
      state.data = d
      state.saves++
    },
  }
}

describe('OverrideStore', () => {
  it('stores and returns pins per scope', () => {
    const store = new OverrideStore(fakePersistence())
    store.set('Rare|Helmets', 'explicit.life', true)
    store.set('Rare|Helmets', 'explicit.coldres', false)
    store.set('u|Mageblood', 'explicit.life', false)
    expect(store.forScope('Rare|Helmets')).toEqual({ 'explicit.life': true, 'explicit.coldres': false })
    expect(store.forScope('u|Mageblood')).toEqual({ 'explicit.life': false })
    expect(store.forScope('Rare|Boots')).toEqual({})
  })

  it('unset removes only the targeted pin and prunes empty scopes', () => {
    const store = new OverrideStore(fakePersistence())
    store.set('Rare|Helmets', 'explicit.life', true)
    store.set('Rare|Helmets', 'explicit.coldres', false)
    store.unset('Rare|Helmets', 'explicit.life')
    expect(store.forScope('Rare|Helmets')).toEqual({ 'explicit.coldres': false })
    store.unset('Rare|Helmets', 'explicit.coldres')
    expect(store.forScope('Rare|Helmets')).toEqual({})
  })

  it('unset of a missing pin is a no-op that does not persist', () => {
    const p = fakePersistence()
    const store = new OverrideStore(p)
    store.unset('Rare|Helmets', 'explicit.life')
    expect(p.saves).toBe(0)
  })

  it('persists on every mutation and a new store reloads the data', () => {
    const p = fakePersistence()
    const store = new OverrideStore(p)
    store.set('Rare|Helmets', 'explicit.life', true)
    expect(p.saves).toBe(1)
    const reloaded = new OverrideStore(p)
    expect(reloaded.forScope('Rare|Helmets')).toEqual({ 'explicit.life': true })
  })

  it('forScope returns a copy - mutating it does not affect the store', () => {
    const store = new OverrideStore(fakePersistence())
    store.set('Rare|Helmets', 'explicit.life', true)
    const view = store.forScope('Rare|Helmets')
    view['explicit.life'] = false
    view['explicit.mana'] = true
    expect(store.forScope('Rare|Helmets')).toEqual({ 'explicit.life': true })
  })
})
