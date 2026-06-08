import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ScrubInput } from './ScrubInput'

/** ScrubInput is the click-and-drag-to-scrub number field used in the regex
 *  tool's qualifier rows. Clicking enters edit mode for keyboard input;
 *  dragging horizontally adjusts the value by `step`. Stories control the
 *  value via local state so the drag/scroll behavior is observable in the
 *  canvas. */
const meta: Meta<typeof ScrubInput> = {
  title: 'Regex Tool / ScrubInput',
  component: ScrubInput,
}
export default meta

type Story = StoryObj<typeof ScrubInput>

const Wrapper = (args: React.ComponentProps<typeof ScrubInput>): JSX.Element => {
  const [v, setV] = useState<number | null>(args.value)
  return <ScrubInput {...args} value={v} onChange={setV} />
}

export const Empty: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: null, placeholder: '--' },
}

export const Integer: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 12, step: 1 },
}

export const Percent: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 90, suffix: '%' },
}

export const Decimal_AttacksPerSecond: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 1.45, decimals: 2 },
}

export const ColoredInvalid: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 999, color: '#ef5350' },
}
