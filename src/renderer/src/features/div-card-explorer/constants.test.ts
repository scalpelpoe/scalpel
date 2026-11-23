import { describe, expect, it } from 'vitest'
import { applyMapDrops, cards, regularMaps } from './constants'
import type { DivCard, MapData } from './types'

const card = (name: string, areas: string[]): DivCard => ({
  art: '',
  name,
  price: 1,
  stack: 1,
  reward: '',
  drop: { areas, min_level: 0, monsters: [], text: '' },
})
const map = (name: string, id: string, type = 'map'): MapData => ({ name, ids: [id], type, atlas: true, levels: [] })

describe('applyMapDrops', () => {
  const rawMaps = [map('Old Map', 'MapWorldsOld'), map('Graveyard Map', 'MapWorldsGraveyard')]
  const drops = { MapWorldsGraveyard: { name: 'Graveyard', cards: [{ name: 'The Fletcher' }] } }

  it('replaces regular-map areas with the overlay, keeping non-map areas', () => {
    const [stale, fresh] = applyMapDrops(
      [card('Damnation', ['MapWorldsGraveyard', 'MapWorldsOld', '1_3_2']), card('The Fletcher', ['MapWorldsOld'])],
      rawMaps,
      drops,
    )
    expect(stale.drop.areas).toEqual(['1_3_2'])
    expect(fresh.drop.areas).toEqual(['MapWorldsGraveyard'])
  })
})

describe('bundled 3.30 map drops', () => {
  const at = (mapName: string): string[] => {
    const m = regularMaps.find((x) => x.name === mapName)!
    return cards.filter((c) => c.drop.areas.some((a) => m.ids.includes(a))).map((c) => c.name)
  }

  it('uses the 3.30 Graveyard pool', () => {
    expect(at('Graveyard Map').sort()).toEqual([
      "Bowyer's Dream",
      'Struck by Lightning',
      'The Enlightened',
      'The Fletcher',
    ])
  })

  it('lists returning maps and drops rotated-out ones', () => {
    const names = regularMaps.map((m) => m.name)
    expect(names).toContain('Academy Map')
    expect(names).not.toContain('Bazaar Map')
  })
})
