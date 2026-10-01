import type { SnapshotItem } from '@scalpel/stream-contract'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PriceCheckPanel } from '../components/PriceCheckPanel'
import { ViewerRoot } from '../components/ViewerRoot'
import { samplePriceChecks, sampleSnapshot, withPriceCheck } from './story-data'

const meta: Meta<typeof PriceCheckPanel> = {
  title: 'Stream/PriceCheckPanel',
  component: PriceCheckPanel,
  args: { onBack: () => {} },
  decorators: [
    (Story) => (
      <ViewerRoot style={{ width: 354, padding: 12, background: '#101015' }}>
        <Story />
      </ViewerRoot>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof PriceCheckPanel>

export const Rare: Story = {
  args: { item: withPriceCheck(sampleSnapshot.equipment.Ring as SnapshotItem, 'ring') },
}

export const Unique: Story = {
  args: { item: withPriceCheck(sampleSnapshot.equipment.Ring2 as SnapshotItem, 'unique') },
}

/** Misc rows are a chip strip above the stat rows: Yes/No/Any flags (click cycles), Item Level Min/Max/Off. */
export const ChipStrip: Story = {
  args: { item: withPriceCheck(sampleSnapshot.equipment.BodyArmour as SnapshotItem, 'armour') },
}

/** The Twitch panel is 318px wide; long mod text has to wrap beside the min/max boxes. */
export const LongMods: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 318 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    item: {
      ...withPriceCheck(sampleSnapshot.equipment.Ring as SnapshotItem, 'ring'),
      priceCheck: {
      ...samplePriceChecks.ring,
      rows: samplePriceChecks.ring.rows.map((r, i) =>
        i < 3
          ? {
              ...r,
              text: `${r.text} while you have at least 50 of the highest attribute and are not on full Life`,
            }
          : r,
      ),
      },
    },
  },
}
