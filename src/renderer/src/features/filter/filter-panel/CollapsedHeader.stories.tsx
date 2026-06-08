import type { Meta, StoryObj } from '@storybook/react-vite'
import { CollapsedHeader } from './CollapsedHeader'
import chaosIcon from '../../../assets/currency/chaos-orb.png'

/** Sticky header that slides in from the top when the user scrolls past the
 *  filter-panel hero. Carries the item icon, name, and a compact SaveButton
 *  so the user never loses access to Save while reviewing matched blocks
 *  further down. The translateY/opacity animation is driven by `collapsed`. */
const meta: Meta<typeof CollapsedHeader> = {
  title: 'Filter Panel / CollapsedHeader',
  component: CollapsedHeader,
  args: { onSave: () => {} },
  decorators: [
    (Story) => (
      <div className="relative w-[480px] h-[120px] bg-bg-card rounded overflow-hidden">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof CollapsedHeader>

export const VisibleDirty: Story = {
  args: {
    collapsed: true,
    iconUrl: chaosIcon,
    itemName: 'Chaos Orb',
    baseType: 'Chaos Orb',
    rarityColor: '#fff',
    isDirty: true,
    isSaving: false,
    isSaved: false,
  },
}

export const VisibleSaved: Story = {
  args: {
    collapsed: true,
    iconUrl: chaosIcon,
    itemName: 'Headhunter',
    baseType: 'Leather Belt',
    rarityColor: '#af6025',
    isDirty: false,
    isSaving: false,
    isSaved: true,
  },
  parameters: {
    docs: { description: { story: 'Unique item: name color overrides; baseType differs so the unique name shows.' } },
  },
}

export const HiddenAboveFold: Story = {
  args: {
    collapsed: false,
    iconUrl: chaosIcon,
    itemName: 'Some Item',
    baseType: 'Some Item',
    rarityColor: '#fff',
    isDirty: false,
    isSaving: false,
    isSaved: false,
  },
  parameters: {
    docs: { description: { story: 'collapsed=false: header slides up and out via translateY(-100%) + opacity 0.' } },
  },
}
