import type { Meta, StoryObj } from '@storybook/react-vite'
import { DustEntryRow } from './DustEntryRow'
import chaosIcon from '../../assets/currency/chaos-orb.png'
import type { DustEntry } from './types'

/** One row in the dust-explorer table: zebra-striped item icon + name +
 *  price-check shortcut + price chip + dust columns. Clicking the name
 *  loads the item via the lookupBaseType IPC; the buy icon fires sisterOpen-
 *  PriceCheck. Both stubs live in `.storybook/preview.tsx`. */
const meta: Meta<typeof DustEntryRow> = {
  title: 'Dust Explorer / DustEntryRow',
  component: DustEntryRow,
  decorators: [
    (Story) => (
      <div className="bg-bg-card rounded w-[640px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof DustEntryRow>

const baseEntry = (overrides: Partial<DustEntry> = {}): DustEntry => ({
  name: 'Tabula Rasa',
  baseType: 'Simple Robe',
  dustIlvl84: 880,
  slots: 1,
  chaosValue: 22,
  dustPerChaos: 40,
  dustPerChaosPerSlot: 40,
  iconUrl: chaosIcon,
  ...overrides,
})

const sharedProps = {
  divineRate: 200,
  mirrorRate: 4500000,
  classMap: { 'Simple Robe': 'Body Armours', 'Two-Toned Boots': 'Boots' },
}

export const Standard: Story = {
  args: { entry: baseEntry(), index: 0, ...sharedProps },
}

export const Zebra: Story = {
  args: { entry: baseEntry({ name: 'Goldrim', baseType: 'Leather Cap' }), index: 1, ...sharedProps },
  parameters: { docs: { description: { story: 'Odd-index rows lose the zebra tint.' } } },
}

export const NoPrice: Story = {
  args: {
    entry: baseEntry({
      name: 'Squire',
      baseType: 'Tower Shield',
      chaosValue: null,
      dustPerChaos: null,
      dustPerChaosPerSlot: null,
    }),
    index: 0,
    ...sharedProps,
  },
  parameters: {
    docs: { description: { story: 'Item with no price -- price + ratio columns show the dim placeholder.' } },
  },
}

export const NoIcon: Story = {
  args: { entry: baseEntry({ name: 'Mystery Unique', iconUrl: null }), index: 0, ...sharedProps },
}

export const HighSlots: Story = {
  args: { entry: baseEntry({ name: 'Two-Toned Boots', slots: 4, dustPerChaosPerSlot: 10 }), index: 0, ...sharedProps },
  parameters: { docs: { description: { story: 'Multi-slot items dilute the per-slot ratio (slots=4 here).' } } },
}
