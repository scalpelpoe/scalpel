import type { Meta, StoryObj } from '@storybook/react-vite'
import { CardChips } from './CardChips'
import type { MapCardEntry, TierStyle } from './types'

/** CardChips is the row of small "card thumb + name" pills shown on each map
 *  row in the div-card explorer. Cards are tier-colored via `cardTiers` +
 *  `tierStyles`; an untiered card gets the dim default chip. The clickable
 *  hover state and the `+N more` overflow indicator are exercised below. */
const meta: Meta<typeof CardChips> = {
  title: 'Div Card Explorer / CardChips',
  component: CardChips,
  decorators: [
    (Story) => (
      <div className="w-[680px] bg-bg-card p-3 rounded">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof CardChips>

const card = (name: string, art: string): MapCardEntry => ({
  card: {
    name,
    art,
    price: 0,
    weight: 0,
    stack: 1,
    reward: '',
    drop: { areas: [], min_level: 0, monsters: [], text: '' },
  },
  dropRate: 0,
  cardEv: 0,
})

const TIER_STYLES: Record<string, TierStyle> = {
  S: { border: '#fbbf24', bg: 'rgba(251,191,36,0.18)', text: '#fde68a' },
  A: { border: '#a78bfa', bg: 'rgba(167,139,250,0.18)', text: '#ddd6fe' },
  B: { border: '#60a5fa', bg: 'rgba(96,165,250,0.18)', text: '#bfdbfe' },
}

const SAMPLE_CARDS: MapCardEntry[] = [
  card('The Doctor', 'TheDoctor'),
  card('Wealth and Power', 'WealthAndPower'),
  card("The Saint's Treasure", 'TheSaintsTreasure'),
  card("Brother's Gift", 'BrothersGift'),
]

export const TieredMix: Story = {
  args: {
    topCards: SAMPLE_CARDS,
    totalCount: 4,
    showCount: 4,
    cardTiers: { 'The Doctor': 'S', 'Wealth and Power': 'A', "The Saint's Treasure": 'B' },
    tierStyles: TIER_STYLES,
    hiddenCards: {},
    onSelectCard: () => {},
  },
}

export const WithHiddenCard: Story = {
  args: {
    topCards: SAMPLE_CARDS.slice(0, 3),
    totalCount: 3,
    showCount: 3,
    cardTiers: { 'The Doctor': 'S', 'Wealth and Power': 'A' },
    tierStyles: TIER_STYLES,
    hiddenCards: { 'Wealth and Power': true },
    onSelectCard: () => {},
  },
  parameters: { docs: { description: { story: 'Hidden cards render at 50% opacity.' } } },
}

export const WithOverflow: Story = {
  args: {
    topCards: SAMPLE_CARDS.slice(0, 2),
    totalCount: 8,
    showCount: 2,
    cardTiers: { 'The Doctor': 'S' },
    tierStyles: TIER_STYLES,
    hiddenCards: {},
    onSelectCard: () => {},
  },
  parameters: {
    docs: { description: { story: 'When more cards exist than `showCount`, the strip shows a "+N more" tag.' } },
  },
}

export const NoTiers: Story = {
  args: {
    topCards: SAMPLE_CARDS,
    totalCount: 4,
    showCount: 4,
    cardTiers: {},
    tierStyles: {},
    hiddenCards: {},
    onSelectCard: () => {},
  },
  parameters: { docs: { description: { story: 'No tier mapping -- every card uses the dim default chip style.' } } },
}
