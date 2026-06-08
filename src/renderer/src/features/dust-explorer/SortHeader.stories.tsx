import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SortHeader } from './SortHeader'
import type { SortKey, SortDir } from './types'

/** SortHeader is one column heading in the dust-explorer table -- a label
 *  with an up/down chevron pair that highlights the active direction.
 *  Clicking cycles the column's sort. The container that owns active+dir
 *  state lives one level up; stories below host it locally so the click
 *  toggles work in the canvas. */
const meta: Meta<typeof SortHeader> = {
  title: 'Dust Explorer / SortHeader',
  component: SortHeader,
  decorators: [
    (Story) => (
      <div className="bg-bg-card p-2 rounded inline-flex">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof SortHeader>

const Host = (props: {
  initialActive: SortKey
  initialDir?: SortDir
  mySortKey: SortKey
  label: string
  flex?: boolean
  width?: number
}): JSX.Element => {
  const [active, setActive] = useState<SortKey>(props.initialActive)
  const [dir, setDir] = useState<SortDir>(props.initialDir ?? 'desc')
  return (
    <SortHeader
      label={props.label}
      sortKey={props.mySortKey}
      active={active}
      dir={dir}
      flex={props.flex}
      width={props.width}
      onSort={(k) => {
        if (k === active) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        else {
          setActive(k)
          setDir('desc')
        }
      }}
    />
  )
}

export const ActiveDesc: Story = {
  render: () => (
    <Host initialActive="dustIlvl84" initialDir="desc" mySortKey="dustIlvl84" label="Dust @ ilvl 84" width={130} />
  ),
}

export const ActiveAsc: Story = {
  render: () => (
    <Host initialActive="dustIlvl84" initialDir="asc" mySortKey="dustIlvl84" label="Dust @ ilvl 84" width={130} />
  ),
}

export const Inactive: Story = {
  render: () => <Host initialActive="name" mySortKey="dustIlvl84" label="Dust @ ilvl 84" width={130} />,
  parameters: { docs: { description: { story: 'Inactive column: chevrons dim, label dim.' } } },
}

export const FlexLabel: Story = {
  render: () => <Host initialActive="name" mySortKey="name" label="Name" flex={true} />,
  parameters: {
    docs: {
      description: { story: 'flex=true grows the header to fill available space (used for the leftmost column).' },
    },
  },
}
