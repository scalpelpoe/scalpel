import type { Meta, StoryObj } from '@storybook/react-vite'
import { TierIconStrip } from './TierIconStrip'

/** TierIconStrip renders one row of base-type icons sized to "as many as fully
 *  fit the container width". It uses ResizeObserver + useLayoutEffect to
 *  measure synchronously, so resizing the canvas live grows/shrinks the
 *  visible-icon count without flicker. The names are looked up against
 *  `iconMap` -- if the renderer hasn't initialized the icon map for the
 *  current PoE version, all icons fall through and the strip is empty. */
const meta: Meta<typeof TierIconStrip> = {
  title: 'Filter Block Editor / TierIconStrip',
  component: TierIconStrip,
  decorators: [
    (Story, ctx) => {
      const width = (ctx.parameters.hostWidth as number | undefined) ?? 240
      return (
        <div className="bg-bg-card p-2" style={{ width }}>
          <Story />
        </div>
      )
    },
  ],
}
export default meta

type Story = StoryObj<typeof TierIconStrip>

const COMMON_BASES = [
  'Glorious Plate',
  'Astral Plate',
  'Sacred Burgonet',
  'Lion Pelt',
  'Vaal Regalia',
  'Hubris Circlet',
  'Eternal Burgonet',
  'Royal Burgonet',
  'Crusader Plate',
]

export const Narrow: Story = {
  args: { names: COMMON_BASES },
  parameters: { hostWidth: 90 },
}

export const Medium: Story = {
  args: { names: COMMON_BASES },
  parameters: { hostWidth: 240 },
}

export const Wide: Story = {
  args: { names: COMMON_BASES },
  parameters: { hostWidth: 480 },
}

export const EmptyIfUnknown: Story = {
  args: { names: ['Made-Up Item One', 'Made-Up Item Two'] },
  parameters: {
    docs: {
      description: {
        story: 'If none of the names resolve in `iconMap`, the strip renders empty rather than placeholder boxes.',
      },
    },
  },
}
