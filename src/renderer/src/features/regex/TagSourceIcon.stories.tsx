import type { Meta, StoryObj } from '@storybook/react-vite'
import { TagSourceIcon } from './mapmods-helpers'

/** Tiny icon shown next to a preset tag in the regex tool save bar, indicating
 *  what kind of tag it is: a qualifier, an avoid mod, or a want mod. Returns
 *  `null` for unknown sources, so the "no source" story renders empty. */
const meta: Meta<typeof TagSourceIcon> = {
  title: 'Regex Tool / TagSourceIcon',
  component: TagSourceIcon,
  args: { size: 14 },
}
export default meta

type Story = StoryObj<typeof TagSourceIcon>

export const Qualifier: Story = { args: { source: 'qualifier' } }
export const Avoid: Story = { args: { source: 'avoid' } }
export const Want: Story = { args: { source: 'want' } }
export const Unknown: Story = {
  args: { source: 'something-else' },
  parameters: { docs: { description: { story: 'Returns `null` for unrecognized source values.' } } },
}
