import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus, Down } from '@icon-park/react'
import { TierActionCard } from './TierActionCard'

/** TierActionCard wraps a flexible top zone with a button pinned to the
 *  bottom edge. Used in the filter-block editor where multiple cards sit
 *  side-by-side and need their bottom buttons to baseline-align regardless
 *  of how tall each top zone ended up. Pass `primary` for the gold accent. */
const meta: Meta<typeof TierActionCard> = {
  title: 'Filter Block Editor / TierActionCard',
  component: TierActionCard,
  args: { onClick: () => {} },
  decorators: [
    (Story) => (
      <div className="w-[200px] flex">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof TierActionCard>

export const Default: Story = {
  args: {
    children: <div className="text-[11px] text-text-dim">Move tier UP</div>,
    buttonLabel: 'Move',
  },
}

export const Primary: Story = {
  args: {
    children: <div className="text-[12px] text-text font-semibold">Apply Tier</div>,
    buttonLabel: 'Apply',
    primary: true,
  },
}

export const WithLeadingIcon: Story = {
  args: {
    children: <div className="text-[11px] text-text-dim">Add new block</div>,
    leadingIcon: <Plus size={11} theme="outline" fill="currentColor" />,
    buttonLabel: 'Add Block',
  },
}

export const Disabled: Story = {
  args: {
    children: <div className="text-[11px] text-text-dim">Cannot demote -- already at lowest tier</div>,
    leadingIcon: <Down size={11} theme="outline" fill="currentColor" />,
    buttonLabel: 'Demote',
    disabled: true,
  },
}
