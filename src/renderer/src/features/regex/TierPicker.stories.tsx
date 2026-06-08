import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { TierPicker, MAP_TIER_ICONS, ORIGINATOR_TIER_ICONS } from './TierPicker'

/** TierPicker is the slide-down strip below the regex generator's chip row
 *  where the user picks which tier of map to trade-search. It surfaces:
 *    - Originator + 8-mod toggles
 *    - the T1..T16 tier icon row (collapsed to "showAllTiers" in normal mode)
 *    - a Nightmare-only variant when the regex includes a nightmare-only mod
 *  Stories use stateful hosts so the chip toggles + show-all-tiers expansion
 *  work in the canvas. */
const meta: Meta<typeof TierPicker> = {
  title: 'Regex Tool / TierPicker',
  component: TierPicker,
  decorators: [
    (Story) => (
      <div className="w-[680px] bg-bg-card p-3 rounded">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof TierPicker>

interface HostProps {
  hasNightmareMod?: boolean
  initialOriginator?: boolean
  initial8mod?: boolean
  initialShowAll?: boolean
  regex?: string
}

const Host = ({
  hasNightmareMod = false,
  initialOriginator = false,
  initial8mod = false,
  initialShowAll = false,
  regex = '"r [2-9]\\)|1[0123456]\\)" "fire$|eble"',
}: HostProps): JSX.Element => {
  const [showAllTiers, setShowAllTiers] = useState(initialShowAll)
  const [tradeOriginator, setTradeOriginator] = useState(initialOriginator)
  const [tradeCorrupted8mod, setTradeCorrupted8mod] = useState(initial8mod)
  const tierIcons = tradeOriginator ? ORIGINATOR_TIER_ICONS : MAP_TIER_ICONS
  return (
    <TierPicker
      showTierPicker={true}
      showTradeResults={false}
      showAllTiers={showAllTiers}
      setShowAllTiers={setShowAllTiers}
      tradeOriginator={tradeOriginator}
      setTradeOriginator={setTradeOriginator}
      tradeCorrupted8mod={tradeCorrupted8mod}
      setTradeCorrupted8mod={setTradeCorrupted8mod}
      hasNightmareMod={hasNightmareMod}
      tradeSearching={false}
      regex={regex}
      tierIcons={tierIcons}
      searchMapTrade={(tier, nm) => alert(`Search T${tier}${nm ? ' (Nightmare)' : ''}`)}
    />
  )
}

export const Default: Story = {
  render: () => <Host />,
  parameters: {
    docs: { description: { story: 'Standard mode -- shows the high-tier-only row by default.' } },
  },
}

export const ShowAllTiers: Story = {
  render: () => <Host initialShowAll={true} />,
  parameters: {
    docs: { description: { story: 'Expanded T1..T16 row.' } },
  },
}

export const OriginatorMode: Story = {
  render: () => <Host initialOriginator={true} />,
  parameters: {
    docs: { description: { story: 'Originator chip flips the row to Zana/Originator-variant icons.' } },
  },
}

export const NightmareMod: Story = {
  render: () => <Host hasNightmareMod={true} />,
  parameters: {
    docs: {
      description: { story: "When the user's regex includes a Nightmare-only mod, only T14-T16 + Nightmare render." },
    },
  },
}

export const DisabledNoRegex: Story = {
  render: () => <Host regex="" />,
  parameters: {
    docs: { description: { story: 'Empty regex disables the tier buttons (clicking them does nothing).' } },
  },
}
