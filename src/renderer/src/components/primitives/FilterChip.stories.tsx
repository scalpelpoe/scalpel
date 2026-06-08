import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilterChip } from './FilterChip'

/** FilterChip is the workhorse pill control across the price-check overlay --
 *  every toggle, every status flag, every ternary "any/yes/no" filter is one
 *  of these. The two modes (binary `active` vs ternary `state` + `onChange`)
 *  produce visually distinct chips, hence the split into separate stories.
 *
 *  The decorator wraps each story in an inline-flex host: in production, the
 *  chip's `display: flex` (block-level) always lives inside a flex chip-row
 *  parent that constrains its width to content, but in isolation the chip
 *  would stretch to fill the canvas. The wrapper recreates the production
 *  parent shape so the chip renders at its natural width. */
const meta: Meta<typeof FilterChip> = {
  title: 'Price Check / FilterChip',
  component: FilterChip,
  args: {
    label: 'Corrupted',
  },
  decorators: [
    (Story) => (
      <div className="inline-flex">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FilterChip>

export const Inactive: Story = {
  args: { active: false },
}

export const Active: Story = {
  args: { active: true },
}

export const ActiveWithCustomColor: Story = {
  args: { active: true, color: '#4fc3f7' },
}

export const Ternary_Any: Story = {
  args: { onChange: () => {}, state: undefined, label: 'Mirrored' },
}

export const Ternary_Yes: Story = {
  args: { onChange: () => {}, state: 'yes', label: 'Mirrored' },
}

export const Ternary_No: Story = {
  args: { onChange: () => {}, state: 'no', label: 'Mirrored' },
}

export const MinMax_Min: Story = {
  args: { onChange: () => {}, state: 'min', label: 'ilvl: 84', mode: 'minmax' },
}

export const MinMax_Max: Story = {
  args: { onChange: () => {}, state: 'max', label: 'ilvl: 84', mode: 'minmax' },
}
