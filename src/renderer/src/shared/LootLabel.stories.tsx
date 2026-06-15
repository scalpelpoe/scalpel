import type { Meta, StoryObj } from '@storybook/react-vite'
import { LootLabel, HiddenLootLabel } from './LootLabel'
import type { FilterBlock } from '@shared/types'

/** LootLabel renders an item name the same way PoE paints it on the ground:
 *  text color, optional background plate, optional border, all derived from
 *  the actions on the matching filter block. Block-shaped fixtures below
 *  exercise the four ways a label can be styled. */
const meta: Meta<typeof LootLabel> = {
  title: 'Shared / LootLabel',
  component: LootLabel,
}
export default meta

type Story = StoryObj<typeof LootLabel>

// Helper: build a one-element fake block with just the actions we care about.
function styledBlock(actions: Array<{ type: string; values: string[] }>): Pick<FilterBlock, 'actions'> {
  return { actions: actions as FilterBlock['actions'] }
}

export const PlainText: Story = {
  args: {
    label: 'Stibnite',
    block: styledBlock([{ type: 'SetTextColor', values: ['200', '200', '200'] }]),
  },
}

export const Currency: Story = {
  args: {
    label: 'Divine Orb',
    block: styledBlock([
      { type: 'SetTextColor', values: ['255', '208', '128'] },
      { type: 'SetBorderColor', values: ['255', '208', '128'] },
      { type: 'SetBackgroundColor', values: ['0', '0', '0', '255'] },
      { type: 'SetFontSize', values: ['45'] },
    ]),
  },
}

export const Map_T16: Story = {
  args: {
    label: 'Toxic Sewer Map',
    block: styledBlock([
      { type: 'SetTextColor', values: ['255', '255', '255'] },
      { type: 'SetBorderColor', values: ['74', '230', '58'] },
      { type: 'SetBackgroundColor', values: ['10', '40', '10', '230'] },
      { type: 'SetFontSize', values: ['38'] },
    ]),
  },
}

export const Unique: Story = {
  args: {
    label: 'Headhunter',
    block: styledBlock([
      { type: 'SetTextColor', values: ['175', '96', '37'] },
      { type: 'SetBorderColor', values: ['175', '96', '37'] },
      { type: 'SetFontSize', values: ['40'] },
    ]),
  },
}

export const WithStackPrefix: Story = {
  args: {
    label: 'Mirror Shard',
    block: styledBlock([
      { type: 'SetTextColor', values: ['255', '255', '255'] },
      { type: 'SetBorderColor', values: ['255', '255', '255'] },
      { type: 'SetFontSize', values: ['40'] },
    ]),
    showStack: { min: 5 },
  },
}

export const Hidden: StoryObj<typeof HiddenLootLabel> = {
  render: (args) => <HiddenLootLabel {...args} />,
  args: { label: 'Iron Ring' },
  parameters: {
    docs: { description: { story: 'Items hidden by Hide action; rendered as the dim placeholder shape.' } },
  },
}
