import type { Meta, StoryObj } from '@storybook/react-vite'
import { MapInfoBlock } from './MapInfoBlock'
import type { MapData } from './types'

/** MapInfoBlock is the small badge column on each map row in the div-card
 *  explorer: stylized map-frame icon over a colored gradient (color tracks
 *  the EV ratio), the map name, and the total EV in chaos. */
const meta: Meta<typeof MapInfoBlock> = {
  title: 'Div Card Explorer / MapInfoBlock',
  component: MapInfoBlock,
  decorators: [
    (Story) => (
      <div className="bg-bg-card p-3 rounded inline-block">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof MapInfoBlock>

const baseMap = (overrides: Partial<MapData> = {}): MapData => ({
  name: 'Toxic Sewer Map',
  ids: ['toxic-sewer'],
  type: 'map',
  atlas: true,
  levels: [83],
  ...overrides,
})

export const HighEv: Story = {
  args: { map: baseMap(), totalEv: 12.5, evRatio: 0.92, r: 60, g: 200 },
  parameters: { docs: { description: { story: 'High EV (>0.75 ratio): the value text turns gold.' } } },
}

export const MidEv: Story = {
  args: { map: baseMap({ name: 'Coves Map' }), totalEv: 4.7, evRatio: 0.45, r: 120, g: 120 },
}

export const LowEv: Story = {
  args: { map: baseMap({ name: 'Tropical Island Map' }), totalEv: 0.6, evRatio: 0.08, r: 60, g: 30 },
}
