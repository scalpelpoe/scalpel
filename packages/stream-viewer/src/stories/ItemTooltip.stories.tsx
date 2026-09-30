import type { SnapshotItem } from '@scalpel/stream-contract'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ItemTooltip } from '../components/ItemTooltip'
import { ViewerRoot } from '../components/ViewerRoot'
import { realSnapshot, sampleSnapshot } from './story-data'

const real = realSnapshot()

const meta: Meta<typeof ItemTooltip> = {
  title: 'Stream/ItemTooltip',
  component: ItemTooltip,
  decorators: [
    (Story) => (
      <ViewerRoot style={{ padding: 12, background: '#101015' }}>
        <Story />
      </ViewerRoot>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ItemTooltip>

export const RealRareWithTiers: Story = { args: { item: real.equipment.Helm as SnapshotItem } }
export const RealDesecratedRing: Story = { args: { item: real.equipment.Ring2 as SnapshotItem } }
export const RealUniqueBody: Story = { args: { item: real.equipment.BodyArmour as SnapshotItem } }
export const RealRunedGloves: Story = { args: { item: real.equipment.Gloves as SnapshotItem } }
export const SampleUniqueWithPrice: Story = { args: { item: sampleSnapshot.equipment.BodyArmour as SnapshotItem } }
export const SampleMagicFlask: Story = { args: { item: sampleSnapshot.flasks[0] } }
export const AffixlessTier: Story = {
  args: {
    item: {
      ...(sampleSnapshot.equipment.Ring as SnapshotItem),
      sections: [{ kind: 'explicit', lines: [{ text: '+42 to maximum Life', tier: { num: 2, label: 'T2' } }] }],
    },
  },
}
