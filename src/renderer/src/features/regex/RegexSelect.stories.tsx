import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { RegexSelect } from './RegexSelect'

/** RegexSelect is the ScrubInput-matched dropdown used for fixed-option
 *  qualifier values (e.g. the waystone "drop chance over" %). Stories drive
 *  the value via local state so the option popup is interactive in canvas. */
const meta: Meta<typeof RegexSelect> = {
  title: 'Regex Tool / RegexSelect',
  component: RegexSelect,
}
export default meta

type Story = StoryObj<typeof RegexSelect>

const Wrapper = (args: React.ComponentProps<typeof RegexSelect>): JSX.Element => {
  const [v, setV] = useState<number>(args.value)
  return <RegexSelect {...args} value={v} onChange={setV} />
}

const DROP_OPTIONS = [100, 200, 300, 400, 500, 600, 700]

export const Enabled: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 100, options: DROP_OPTIONS, suffix: '%' },
}

export const Disabled: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 100, options: DROP_OPTIONS, suffix: '%', disabled: true },
}

export const HighValue: Story = {
  render: (args) => <Wrapper {...args} />,
  args: { value: 700, options: DROP_OPTIONS, suffix: '%' },
}

/** Side-by-side with the row label so the alignment against neighboring
 *  qualifier rows is obvious. */
export const InQualifierRow: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 px-3 py-[6px]" style={{ background: '#23232e', width: 320 }}>
      <input type="checkbox" defaultChecked />
      <span className="text-[11px] flex-1" style={{ color: 'var(--text)' }}>
        Waystone drop chance over
      </span>
      <Wrapper {...args} />
    </div>
  ),
  args: { value: 100, options: DROP_OPTIONS, suffix: '%' },
}
