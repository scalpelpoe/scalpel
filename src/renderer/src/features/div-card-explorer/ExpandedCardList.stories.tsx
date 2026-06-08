import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExpandedCardList } from './ExpandedCardList'
import type { MapCardEntry } from './types'

/** ExpandedCardList renders the per-map drill-down: a header row, an
 *  optional "N outliers excluded" notice, and one row per card with weight /
 *  price / EV-per-map columns plus a flag toggle. Flagged cards are
 *  excluded from the map's EV total; hidden cards render at half opacity. */
const meta: Meta<typeof ExpandedCardList> = {
  title: 'Div Card Explorer / ExpandedCardList',
  component: ExpandedCardList,
  args: { onSelectCard: () => {}, onToggleFlag: () => {} },
  decorators: [
    (Story) => (
      <div className="w-[680px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ExpandedCardList>

const card = (name: string, art: string, price: number, weight: number): MapCardEntry => ({
  card: { name, art, price, weight, stack: 1, reward: '', drop: { areas: [], min_level: 0, monsters: [], text: '' } },
  dropRate: weight / 10000,
  cardEv: (price * weight) / 10000,
})

const SAMPLE: MapCardEntry[] = [
  card('The Doctor', 'TheDoctor', 1200, 35),
  card('Wealth and Power', 'WealthAndPower', 350, 80),
  card("The Saint's Treasure", 'TheSaintsTreasure', 80, 200),
  card('Brother’s Gift', 'BrothersGift', 12, 1500),
  card('Anarchy’s Price', 'AnarchysPrice', 4, 4200),
]

export const FullList: Story = {
  args: {
    cards: SAMPLE,
    r: 60,
    g: 200,
    divineRate: 200,
    cardTiers: {},
    flaggedCards: new Set(),
    hiddenCards: {},
  },
}

export const WithFlaggedOutliers: Story = {
  args: {
    cards: SAMPLE,
    r: 200,
    g: 200,
    divineRate: 200,
    cardTiers: {},
    flaggedCards: new Set(['The Doctor']),
    hiddenCards: {},
  },
  parameters: {
    docs: { description: { story: 'Flagged outliers tinted orange + the "N outliers excluded" header banner.' } },
  },
}

export const WithHiddenCards: Story = {
  args: {
    cards: SAMPLE,
    r: 200,
    g: 60,
    divineRate: 200,
    cardTiers: {},
    flaggedCards: new Set(),
    hiddenCards: { 'Anarchy’s Price': true },
  },
}

export const ShortList: Story = {
  args: {
    cards: SAMPLE.slice(0, 2),
    r: 100,
    g: 160,
    divineRate: 200,
    cardTiers: {},
    flaggedCards: new Set(),
    hiddenCards: {},
  },
}
