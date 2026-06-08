import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ModList } from './ModList'
import { TAB_COLORS } from './mapmods-helpers'

/** ModList renders a grouped, scrollable mod-checkbox column -- the core of
 *  the regex tool's avoid/want tabs. Stories use a stateful host so the
 *  toggle + collapse interactions are observable in the canvas. The grouped
 *  data passed below is hand-built to look like a representative sample of
 *  PoE1 map mods, but the component is fully data-driven so anything
 *  matching the `ModGroup` shape will render. */
const meta: Meta<typeof ModList> = {
  title: 'Regex Tool / ModList',
  component: ModList,
  decorators: [
    (Story) => (
      <div className="h-[420px] w-[420px] flex flex-col bg-bg-card rounded">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ModList>

const SAMPLE_GROUPS = [
  {
    key: 'lethal',
    label: 'Lethal',
    color: '#ef5350',
    mods: [
      { id: 1, text: 'Players have -X% to all maximum Resistances' },
      { id: 2, text: 'Monsters reflect X% of Physical Damage' },
      { id: 3, text: 'X% increased Monster Damage' },
    ],
  },
  {
    key: 'dangerous',
    label: 'Dangerous',
    color: '#ff9800',
    mods: [
      { id: 4, text: 'Monsters fire X additional Projectiles' },
      { id: 5, text: 'X% chance for Rare Monsters to Fracture on death' },
    ],
  },
  {
    key: 'annoying',
    label: 'Annoying',
    color: '#ffd54f',
    mods: [
      { id: 6, text: 'Players cannot Regenerate Life, Mana or Energy Shield' },
      { id: 7, text: 'X% reduced effect of Curses on Monsters' },
      { id: 8, text: 'Monsters have X% increased Area of Effect', badge: { label: 'NM', color: TAB_COLORS.nightmare } },
    ],
  },
]

const Host = (args: { tab?: 'avoid' | 'want' }): JSX.Element => {
  const tab = args.tab ?? 'avoid'
  const [selected, setSelected] = useState<Set<string | number>>(new Set([2, 6]))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['annoying']))
  const tabColor = tab === 'avoid' ? TAB_COLORS.avoid : TAB_COLORS.want
  const selectedTint = tab === 'avoid' ? 'rgba(239,83,80,0.08)' : 'rgba(129,199,132,0.08)'
  return (
    <ModList
      grouped={SAMPLE_GROUPS}
      selected={selected}
      collapsed={collapsed}
      tabColor={tabColor}
      selectedTint={selectedTint}
      toggle={(id) =>
        setSelected((prev) => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        })
      }
      toggleCollapse={(key) =>
        setCollapsed((prev) => {
          const next = new Set(prev)
          next.has(key) ? next.delete(key) : next.add(key)
          return next
        })
      }
    />
  )
}

export const AvoidTab: Story = {
  render: () => <Host tab="avoid" />,
}

export const WantTab: Story = {
  render: () => <Host tab="want" />,
}
