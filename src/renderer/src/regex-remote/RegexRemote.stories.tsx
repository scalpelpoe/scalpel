import type { Meta, StoryObj } from '@storybook/react-vite'
import type { RegexPreset } from '@shared/types'
import { RegexRemote } from './RegexRemote'

function preset(id: string, name: string, generator: string, color?: string): RegexPreset {
  return {
    id,
    name,
    generator,
    color,
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: {},
    nightmare: false,
    regex: 'aaa',
  }
}

const PRESETS_POE1 = [
  preset('m1', 'T16 Juiced', 'maps', '#7c3aed'),
  preset('m2', 'Safe Map Mods', 'maps'),
  preset('m3', 'Quant Only', 'maps', '#15803d'),
  preset('f1', 'Life + Bleed', 'flasks'),
  preset('c1', 'Chaos Recipe', 'custom', '#b45309'),
  preset('c2', 'Six Link Bases', 'custom'),
]

/** The in-game Regex Remote pad: saved presets grouped by generator, each row
 *  a click-to-paste chip with a hover-revealed grip for drag reordering.
 *  Storybook has no preload bridge, so window.api is stubbed - reorder writes
 *  log instead of hitting the store. The pad's own `h-screen` needs a fixed
 *  host to resolve against. */
const meta: Meta<typeof RegexRemote> = {
  title: 'Regex Remote / Pad',
  component: RegexRemote,
  decorators: [
    (Story) => (
      <div className="w-[240px] h-[420px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof RegexRemote>

function stubApi(poeVersion: 1 | 2, presets: RegexPreset[], hotkeys: Record<string, string> = {}): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getOverlayState: async () => ({ poeVersion, gameBounds: null }),
    getOverlayPinned: async () => false,
    setOverlayPinned: () => {},
    getSettings: async () => ({
      appMacros: Object.entries(hotkeys).map(([presetId, hotkey]) => ({
        action: 'useSavedRegex',
        presetId,
        hotkey,
      })),
    }),
    getRegexPresets: async () => presets,
    onRegexPresetsChanged: () => () => {},
    // Reorder is local-only here: the story's list state lives in the
    // component, so a drag sticks for the session without a store round-trip.
    reorderRegexPresets: async () => presets,
    regexRemoteApply: () => {},
    regexRemoteHandFocus: () => {},
    regexRemoteMountState: async () => true,
    onRegexRemoteMountChanged: () => () => {},
    closeRegexRemote: () => {},
  }
}

export const Poe1: Story = {
  decorators: [
    (Story) => {
      stubApi(1, PRESETS_POE1, { m1: 'Ctrl+1', c1: 'Ctrl+2' })
      return <Story />
    },
  ],
}

export const Poe2: Story = {
  decorators: [
    (Story) => {
      stubApi(2, [
        preset('w1', 'T15 Waystones', 'waystones', '#b91c1c'),
        preset('w2', 'No Regen', 'waystones'),
        preset('t1', 'Breach Tablets', 'tablet', '#0e7490'),
        preset('r1', 'Relic Corners', 'relic'),
      ])
      return <Story />
    },
  ],
}

/** Empty state: no saved presets yet, so there is nothing to reorder. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      stubApi(1, [])
      return <Story />
    },
  ],
}
