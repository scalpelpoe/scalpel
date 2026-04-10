import cardsData from '../../../../shared/data/economy/div-cards.json'
import mapsData from '../../../../shared/data/economy/div-maps.json'
import globalsData from '../../../../shared/data/economy/div-globals.json'
import { DivCard, MapData } from './types'

export const cards = cardsData as DivCard[]
export const maps = mapsData as MapData[]
export const DROPPOOL_WEIGHT = (globalsData as { droppool_weight: number }).droppool_weight
export const DROPS_PER_MAP = 1000

export const regularMaps = maps.filter((m) => m.atlas && m.type === 'map')
