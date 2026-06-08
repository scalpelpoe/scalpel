import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { BoundaryControl } from './BoundaryControl'

/** Small numeric stepper used in the filter panel for breakpoint boundaries
 *  (e.g. ilvl thresholds, quantity floors). Value lives above; the +/-
 *  chevrons + the editable text input both call `onChange` when the user
 *  nudges or types a new value within `[min, max]`. */
const meta: Meta<typeof BoundaryControl> = {
  title: 'Filter Panel / BoundaryControl',
  component: BoundaryControl,
}
export default meta

type Story = StoryObj<typeof BoundaryControl>

const Host = (args: { value: number; min: number; max?: number }): JSX.Element => {
  const [v, setV] = useState(args.value)
  return <BoundaryControl value={v} min={args.min} max={args.max} onChange={setV} />
}

export const Mid: Story = {
  render: () => <Host value={50} min={0} max={100} />,
}

export const AtMin: Story = {
  render: () => <Host value={0} min={0} max={100} />,
  parameters: {
    docs: { description: { story: 'Value pinned to min: the down chevron is a no-op.' } },
  },
}

export const AtMax: Story = {
  render: () => <Host value={100} min={0} max={100} />,
}

export const Unbounded: Story = {
  render: () => <Host value={84} min={1} />,
  parameters: {
    docs: { description: { story: '`max` defaults to Infinity when not provided.' } },
  },
}
