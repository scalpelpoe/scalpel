import type { Meta, StoryObj } from '@storybook/react-vite'
import type { OverlayData, PoeItem } from '@shared/types'
import { getGameFeatures } from '@shared/game-features'
import { TitleBar } from './TitleBar'

/** The overlay's nav row: brand block on the left, tab buttons on the right.
 *  The interesting state here is the item tab -- it carries the copied item's
 *  art when there is one, and a search icon (opening the 'no-item' search view)
 *  when the clipboard is empty. */
const meta: Meta<typeof TitleBar> = {
  title: 'Overlay / TitleBar',
  component: TitleBar,
  args: {
    view: 'item',
    poeVersion: 1,
    features: getGameFeatures(1),
    hasPriceCheckData: false,
    hiddenTabs: new Set(),
    hiddenPluginTabIds: new Set(),
    pluginTabs: [],
    onSetView: () => {},
    onClose: () => {},
    onMouseDown: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-[540px] bg-bg border border-border rounded-[10px] overflow-hidden">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof TitleBar>

const item: PoeItem = {
  itemClass: 'Rings',
  rarity: 'Rare',
  name: 'Brood Grasp',
  baseType: 'Ruby Ring',
  mapTier: 0,
  itemLevel: 84,
  quality: 0,
  sockets: '',
  linkedSockets: 0,
  armour: 0,
  evasion: 0,
  energyShield: 0,
  ward: 0,
  block: 0,
  reqStr: 0,
  reqDex: 0,
  reqInt: 0,
  corrupted: false,
  identified: true,
  mirrored: false,
  synthesised: false,
  fractured: false,
  transfigured: false,
  blighted: false,
  scourged: false,
  zanaMemory: false,
  implicitCount: 0,
  gemLevel: 0,
  stackSize: 1,
  influence: [],
  explicits: [],
  implicits: [],
  enchants: [],
  imbues: [],
}

const overlayData: OverlayData = { item, matches: [] }

/** Item copied: search on the left, the item's art next to it. */
export const WithItem: Story = {
  args: { overlayData },
}

/** Search opened from the filter page -- the item tab stays put behind it. */
export const SearchOpenWithItem: Story = {
  args: { overlayData, view: 'no-item' },
}

/** Nothing copied: search sits in the same slot, the item tab isn't rendered. */
export const NoItem: Story = {
  args: { overlayData: null, view: 'no-item' },
}

/** Row one fills at 11 icons; plugin tabs beyond the free slots wrap to a right-justified second row. */
export const ManyPluginTabs: Story = {
  args: {
    overlayData,
    view: 'plugin:plugin-6',
    pluginTabs: Array.from({ length: 12 }, (_, index) => ({
      pluginId: `plugin-${index + 1}`,
      label: `Plugin ${index + 1}`,
      icon: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2zM5 5v6l6-3z" fill="currentColor"/></svg>',
    })),
  },
}
