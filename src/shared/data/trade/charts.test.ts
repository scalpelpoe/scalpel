import { describe, expect, it } from 'vitest'
import { CHART_SHAPE_OPTIONS, CHART_ZONES } from './charts'

describe('CHART_ZONES', () => {
  it('covers all 14 zones the trade API indexes', () => {
    expect(Object.keys(CHART_ZONES)).toHaveLength(14)
  })

  it('maps a zone to its trade type and discriminator', () => {
    expect(CHART_ZONES['Sea Pillars']).toEqual({ option: 'SeaPillars', discriminator: 'chart_coral_forest' })
    expect(CHART_ZONES['Abyssal Plain']).toEqual({ option: 'AbyssalPlain', discriminator: 'chart_sandy_seabed' })
    expect(CHART_ZONES['Sunken Totems']).toEqual({ option: 'SunkenTotems', discriminator: 'chart_coral_reef' })
  })

  it('keeps apostrophes and hyphens in the clipboard-facing keys', () => {
    expect(CHART_ZONES["Brine King's Domain"]).toEqual({
      option: 'BrineKingsDomain',
      discriminator: 'chart_coral_reef',
    })
    expect(CHART_ZONES["Kishara's Rest"]).toEqual({ option: 'KisharasRest', discriminator: 'chart_sandy_seabed' })
    expect(CHART_ZONES['Clam-infested Shelf']).toEqual({
      option: 'ClamInfestedShelf',
      discriminator: 'chart_coral_reef',
    })
  })

  it('uses only the three known discriminators, four/five/five zones each', () => {
    const counts: Record<string, number> = {}
    for (const { discriminator } of Object.values(CHART_ZONES)) {
      counts[discriminator] = (counts[discriminator] ?? 0) + 1
    }
    expect(counts).toEqual({ chart_coral_forest: 4, chart_coral_reef: 5, chart_sandy_seabed: 5 })
  })
})

describe('CHART_SHAPE_OPTIONS', () => {
  it('maps every shape name to its trade option id', () => {
    expect(CHART_SHAPE_OPTIONS).toEqual({
      End: '1',
      Corner: '2',
      Straight: '3',
      Junction: '4',
      Crossing: '5',
    })
  })
})
