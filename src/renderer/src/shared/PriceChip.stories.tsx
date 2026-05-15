import type { Meta, StoryObj } from '@storybook/react-vite'
import { PriceChip } from './PriceChip'
import { InfoChip } from './InfoChip'

/** InfoChip + PriceChip stories. PriceChip renders a chaos/divine icon based on
 *  the active PoE version (PoE2 swaps chaos for exalted), so flipping the "PoE
 *  Version" toolbar toggle above the canvas is the easy way to verify the icon
 *  variant at each version. */

const infoMeta: Meta<typeof InfoChip> = {
  title: 'Shared / InfoChip',
  component: InfoChip,
  args: {
    children: 'Inscribed Ultimatum',
  },
}
export default infoMeta

type InfoStory = StoryObj<typeof InfoChip>

export const Default: InfoStory = {
  args: {},
}

export const WithLabel: InfoStory = {
  args: { label: 'Item:', children: 'Inscribed Ultimatum' },
}

export const SmallSize: InfoStory = {
  args: { label: 'ilvl', children: '84', size: 'sm' },
}

export const Colored: InfoStory = {
  args: { children: 'Corrupted', color: '#ef5350' },
}

// PriceChip stories live in the same file so the two related components show
// up adjacent in the catalog tree. The named-meta pattern Storybook 10
// supports lets us declare additional metadata at story level for these.
export const PriceChip_Chaos: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 47 },
  parameters: { docs: { description: { story: 'Chaos-denominated price (PoE1 default).' } } },
}

export const PriceChip_Divine: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 350, divineValue: 2.3 },
  parameters: { docs: { description: { story: 'Divine-denominated price (auto-promoted when value >= 1 divine).' } } },
}

export const PriceChip_FromChaosPerDivine: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 460, chaosPerDivine: 200 },
  parameters: {
    docs: { description: { story: 'Computes divine value from chaos using a chaosPerDivine ratio.' } },
  },
}

export const PriceChip_WithNinjaIcon: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 90, showNinja: true, label: 'ninja' },
}

export const PriceChip_TrendUp: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 120, graph: [5, 8, 10, 12, 15, 18, 22] },
  parameters: { docs: { description: { story: 'Price trending up - last entry +22% exceeds the 15% threshold.' } } },
}

export const PriceChip_TrendDown: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 60, graph: [-3, -5, -8, -12, -16, -20, -25] },
  parameters: {
    docs: { description: { story: 'Price trending down - last entry -25% is below the -15% threshold.' } },
  },
}

export const PriceChip_TrendFlat: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 80, graph: [1, -2, 3, -1, 5, 2, 4] },
  parameters: { docs: { description: { story: 'Price trend flat - last entry +4% is within the ±15% threshold.' } } },
}

export const PriceChip_NoGraph: StoryObj<typeof PriceChip> = {
  render: (args) => <PriceChip {...args} />,
  args: { chaosValue: 47 },
  parameters: { docs: { description: { story: 'No graph data - no trend arrow or sparkline rendered.' } } },
}
