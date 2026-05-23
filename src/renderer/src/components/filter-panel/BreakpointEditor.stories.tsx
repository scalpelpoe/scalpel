import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { BreakpointEditor } from './BreakpointEditor'
import type { StackSizeBreakpoint } from '../../../../shared/types'

/** BreakpointEditor renders a band of "range pill + boundary stepper" pairs
 *  so the user can pick which stack-size / ilvl range they're editing. The
 *  thin colored bar above the pills tracks each range's visibility (Show /
 *  Hide / Minimal). Stories use a stateful host so the boundary BoundaryControls
 *  can be nudged interactively. */
const meta: Meta<typeof BreakpointEditor> = {
  title: 'Filter Panel / BreakpointEditor',
  component: BreakpointEditor,
  decorators: [
    (Story) => (
      <div className="w-[680px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof BreakpointEditor>

// Minimal StackSizeBreakpoint fixture -- BreakpointEditor only reads `min` and
// `activeMatch.block.visibility`, so the deeper MatchResult tree can stay null.
const bp = (min: number, vis: 'Show' | 'Hide' | 'Minimal'): StackSizeBreakpoint =>
  ({
    min,
    max: Infinity,
    // biome-ignore lint/suspicious/noExplicitAny: storybook fixture cast
    activeMatch: { block: { visibility: vis } } as any,
  }) as StackSizeBreakpoint

const Host = (props: {
  breakpoints: StackSizeBreakpoint[]
  label: string
  suffix?: string
  startValue?: number
}): JSX.Element => {
  const [selected, setSelected] = useState<number | null>(0)
  return (
    <BreakpointEditor
      breakpoints={props.breakpoints}
      selectedBpIndex={selected}
      onSelectBp={setSelected}
      onPendingChange={() => {}}
      label={props.label}
      thresholdType="stack"
      suffix={props.suffix}
      startValue={props.startValue ?? 0}
      minBoundary={1}
    />
  )
}

export const StackSize_3Tiers: Story = {
  render: () => (
    <Host label="Stack size breakpoints" breakpoints={[bp(0, 'Hide'), bp(5, 'Show'), bp(10, 'Show')]} suffix="x" />
  ),
}

export const ItemLevel_4Tiers: Story = {
  render: () => (
    <Host
      label="Item level breakpoints"
      breakpoints={[bp(0, 'Hide'), bp(60, 'Minimal'), bp(75, 'Show'), bp(84, 'Show')]}
      suffix=""
    />
  ),
}

export const SingleRange: Story = {
  render: () => <Host label="One range" breakpoints={[bp(0, 'Show')]} />,
  parameters: {
    docs: {
      description: {
        story: 'Only one breakpoint -- no boundary steppers, just a single range pill spanning the whole bar.',
      },
    },
  },
}
