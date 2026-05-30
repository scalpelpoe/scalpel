import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SavedPresetsGrid } from './SavedPresetsGrid'
import type { RegexPreset } from '../../../../shared/types'

/** SavedPresetsGrid renders a wrapping grid of "Saved Regex" boxes beneath the
 *  regex tool's chip header. Each box shows the preset name, has an X to delete,
 *  and loads on click. The component filters by `generator` so only matching
 *  presets show; an empty filtered list returns null and renders nothing. */
const meta: Meta<typeof SavedPresetsGrid> = {
  title: 'Regex Tool / SavedPresetsGrid',
  component: SavedPresetsGrid,
  decorators: [
    (Story) => (
      <div className="w-[680px] bg-bg-solid">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof SavedPresetsGrid>

const SAMPLE_PRESETS: RegexPreset[] = [
  {
    id: 'p1',
    name: 'High quant maps',
    color: '#66bb6a',
    generator: 'maps',
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: { quantity: 90 },
    nightmare: false,
    regex: '',
  },
  {
    id: 'p2',
    name: 'Beyond + breach',
    color: '#7e57c2',
    generator: 'maps',
    avoid: [],
    want: [],
    wantMode: 'all',
    qualifiers: {},
    nightmare: false,
    regex: '',
  },
  {
    id: 'p3',
    name: 'Shaper pack size',
    generator: 'maps',
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: {},
    nightmare: false,
    regex: '',
  },
]

const Host = (props: {
  generator: 'maps' | 'flasks' | 'custom' | 'waystones'
  presets: RegexPreset[]
}): JSX.Element => {
  const [presets, setPresets] = useState(props.presets)
  return (
    <SavedPresetsGrid
      presets={presets}
      generator={props.generator}
      loadPreset={(p) => alert(`Load ${p.id}`)}
      deletePreset={(id) => setPresets((cur) => cur.filter((p) => p.id !== id))}
      boundHotkeyFor={(p) => (p.id === 'p1' ? 'CommandOrControl+1' : undefined)}
    />
  )
}

export const ThreeMapsPresets: Story = {
  render: () => <Host generator="maps" presets={SAMPLE_PRESETS} />,
}

export const SinglePreset: Story = {
  render: () => <Host generator="maps" presets={[SAMPLE_PRESETS[0]]} />,
}

export const Empty: Story = {
  render: () => <Host generator="maps" presets={[]} />,
  parameters: {
    docs: {
      description: { story: 'Empty filtered list returns null -- the grid vanishes entirely.' },
    },
  },
}

export const NoMatchingGenerator: Story = {
  render: () => <Host generator="flasks" presets={SAMPLE_PRESETS} />,
  parameters: {
    docs: {
      description: { story: 'Three presets exist but all are generator=maps, so the flasks tab shows nothing.' },
    },
  },
}
