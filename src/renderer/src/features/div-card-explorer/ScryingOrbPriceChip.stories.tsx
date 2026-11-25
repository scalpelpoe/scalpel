import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScryingOrbPriceChip } from './ScryingOrbPriceChip'

/** ScryingOrbPriceChip is the right-hand bookend of each Div Card Explorer map
 *  row: the orb, and poe.ninja's price for that area's Scrying Orb in the same
 *  pill as the map's EV, promoted to divines once it clears one. Prices and
 *  divine rate below are Covens snapshots. */
const meta: Meta<typeof ScryingOrbPriceChip> = {
  title: 'Div Card Explorer / ScryingOrbPriceChip',
  component: ScryingOrbPriceChip,
  decorators: [
    (Story) => (
      <div className="bg-bg-card p-3 rounded inline-flex">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ScryingOrbPriceChip>

export const Chaos: Story = {
  args: { area: 'Dunes', chaosValue: 8, divineRate: 172 },
}

export const Divine: Story = {
  args: { area: 'Necropolis', chaosValue: 1393, divineRate: 172 },
  parameters: { docs: { description: { story: 'Over one divine: shown in divines.' } } },
}

export const Unpriced: Story = {
  args: { area: 'Colonnade', chaosValue: undefined, divineRate: 172 },
  parameters: {
    docs: { description: { story: 'No ninja line for the area: an empty cell that keeps the column aligned.' } },
  },
}
