import type { Meta, StoryObj } from '@storybook/react'
import { StatFilterRow } from './StatFilterRow'
import type { StatFilter } from './types'

const ladder = [
  {
    tier: 6,
    name: 'Hale',
    ilvl: 1,
    stats: [{ id: 'base_maximum_life', min: 3, max: 9 }],
    range: { min: 3, max: 9 },
    text: '',
  },
  {
    tier: 5,
    name: 'Healthy',
    ilvl: 6,
    stats: [{ id: 'base_maximum_life', min: 10, max: 19 }],
    range: { min: 10, max: 19 },
    text: '',
  },
  {
    tier: 4,
    name: 'Stout',
    ilvl: 33,
    stats: [{ id: 'base_maximum_life', min: 60, max: 69 }],
    range: { min: 60, max: 69 },
    text: '',
  },
]

const filter: StatFilter = {
  id: 'explicit.stat_life',
  text: '+12 to maximum Life',
  value: 12,
  min: 12,
  max: null,
  enabled: true,
  type: 'explicit',
  modTier: 5,
  modRange: { min: 10, max: 19 },
  tierLadder: ladder,
}

const meta: Meta<typeof StatFilterRow> = {
  title: 'PriceCheck/TierScrubChip',
  component: StatFilterRow,
  args: {
    f: filter,
    i: 0,
    rowIdx: 0,
    itemRarity: 'Rare',
    toggleFilter: () => {},
    updateFilterMin: () => {},
    updateFilterMax: () => {},
  },
}
export default meta
export const Default: StoryObj<typeof StatFilterRow> = {}
