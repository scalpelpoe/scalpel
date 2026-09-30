import type { Slot, SnapshotItem, StreamSnapshot } from '@scalpel/stream-contract'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GearPanel } from '../components/GearPanel'
import { ViewerRoot } from '../components/ViewerRoot'
import { head, realSnapshot, sampleSnapshot } from './story-data'

const meta: Meta<typeof GearPanel> = {
  title: 'Stream/GearPanel',
  component: GearPanel,
  decorators: [
    (Story) => (
      <ViewerRoot style={{ width: 354, padding: 12 }}>
        <Story />
      </ViewerRoot>
    ),
  ],
  args: { now: Date.now(), placement: 'below' },
}
export default meta

type Story = StoryObj<typeof GearPanel>

/** A real PoE2 character from poe.ninja, through Scalpel's normalizer and tier badges. */
export const RealCharacter: Story = {
  args: { snapshot: realSnapshot(), head: head() },
}

export const Sample: Story = {
  args: { snapshot: sampleSnapshot, head: head() },
}

/** One of each rarity on the paperdoll, to compare the slot glows side by side. */
export const Rarities: Story = {
  args: {
    snapshot: (() => {
      const s: StreamSnapshot = structuredClone(sampleSnapshot)
      const as = (rarity: SnapshotItem['rarity'], slots: Slot[]): void => {
        for (const slot of slots) {
          const item = s.equipment[slot]
          if (item) s.equipment[slot] = { ...item, rarity, name: rarity === 'normal' ? null : item.name }
        }
      }
      as('normal', ['Helm', 'Ring', 'Belt'])
      as('magic', ['Gloves', 'Amulet'])
      return s
    })(),
    head: head(),
  },
}

export const Paused: Story = {
  args: { snapshot: sampleSnapshot, head: head({ state: 'paused' }) },
}

export const HiddenName: Story = {
  args: { snapshot: { ...sampleSnapshot, character: { ...sampleSnapshot.character, name: null } }, head: head() },
}

export const Stale: Story = {
  args: {
    snapshot: {
      ...sampleSnapshot,
      publishedUtc: new Date(Date.now() - 5 * 3600_000).toISOString(),
      source: { kind: 'poe.ninja', updatedUtc: new Date(Date.now() - 7 * 3600_000).toISOString() },
    },
    head: head(),
  },
}
