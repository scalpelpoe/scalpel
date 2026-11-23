import type { Meta, StoryObj } from '@storybook/react-vite'
import type { UniqueTrackerDetails } from '@shared/contracts/unique-tracker'
import { PriceTrackerPanel } from './PriceTrackerPanel'

const DAY = 86400000
const START = Date.parse('2026-11-14T00:00:00Z')

function history(rates: number[], counts: number[]) {
  return rates.map((rate, i) => ({ t: START + i * DAY, rate, volume: counts[i] ?? 0 }))
}

// Mageblood, Covens week one: chaos climbs while the divine line stays flatter.
const CHAOS = [21000, 24800, 23900, 22500, 21800, 20900, 20393, 20914, 18940]
const DIVINE_RATES = [230, 228, 224, 221, 215.6, 209.4, 205, 209.4, 189.4]
const COUNTS = [2, 6, 14, 27, 31, 40, 52, 61, 70]

const MAGEBLOOD: UniqueTrackerDetails = {
  name: 'Mageblood',
  variant: '4 Flasks',
  pairs: [
    {
      currency: 'divine',
      rate: 100,
      volumePerHour: 0,
      history: history(
        CHAOS.map((c, i) => c / DIVINE_RATES[i]),
        COUNTS,
      ),
    },
    { currency: 'chaos', rate: 18940, volumePerHour: 0, history: history(CHAOS, COUNTS) },
  ],
}

const KAOM: UniqueTrackerDetails = {
  name: "Kaom's Heart",
  pairs: [
    { currency: 'divine', rate: 1.42, volumePerHour: 0, history: history([2.1, 1.9, 1.7, 1.6, 1.5, 1.42], COUNTS) },
    { currency: 'chaos', rate: 269, volumePerHour: 0, history: history([480, 430, 380, 345, 320, 269], COUNTS) },
  ],
}

const meta: Meta<typeof PriceTrackerPanel> = {
  title: 'Price Check/PriceTrackerPanel',
  component: PriceTrackerPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: { onOpenNinja: () => {} },
}
export default meta

type Story = StoryObj<typeof PriceTrackerPanel>

export const WithVariant: Story = { args: { details: MAGEBLOOD } }
export const SingleLine: Story = { args: { details: KAOM } }
export const Narrow: Story = {
  args: { details: MAGEBLOOD },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
}
