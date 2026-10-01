import type { Slot, SnapshotItem, StreamSnapshot } from '@scalpel/stream-contract'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fireEvent, within } from '@testing-library/react'
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

/** A pinned item opened in the price checker (pins the left ring, clicks Price check). */
export const PriceChecking: Story = {
  args: { snapshot: sampleSnapshot, head: head() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    fireEvent.click(await canvas.findByLabelText('Left ring: Blood Band'))
    fireEvent.click(await canvas.findByRole('button', { name: 'Price check' }))
    await canvas.findByRole('link', { name: /Search on trade/ })
  },
}

/** Skills tab on the real character with a gem card shown (hovers the first skill with a card). */
export const SkillGemCard: Story = {
  args: { snapshot: realSnapshot(), head: head() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    fireEvent.click(await canvas.findByRole('tab', { name: 'Skills' }))
    const row = canvasElement.querySelector('[data-card]') as HTMLElement
    fireEvent.mouseEnter(row)
    await canvas.findByRole('tooltip')
  },
}

/** A support gem's card, pinned from the first support chip that has one. */
export const SupportGemCard: Story = {
  args: { snapshot: realSnapshot(), head: head() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    fireEvent.click(await canvas.findByRole('tab', { name: 'Skills' }))
    const chip = canvasElement.querySelector('span[data-card]') as HTMLElement
    fireEvent.click(chip)
    await canvas.findByRole('tooltip')
  },
}

/** Hovering a rune over its slot art shows the rune's card (the real gloves' first rune). */
export const RuneHover: Story = {
  args: { snapshot: realSnapshot(), head: head() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slot = (await canvas.findByLabelText(/^Gloves:/)) as HTMLElement
    fireEvent.mouseEnter(slot)
    fireEvent.mouseEnter(slot.querySelector('.ssv-rune[data-card]') as HTMLElement)
    await canvas.findByRole('tooltip')
  },
}
