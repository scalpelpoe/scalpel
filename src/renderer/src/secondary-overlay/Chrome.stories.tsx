import type { Meta, StoryObj } from '@storybook/react-vite'
import { GridFour, GridNine, GridSixteen } from '@icon-park/react'
import { Chrome } from './Chrome'

// Storybook has no preload bridge; stub just enough for the pin toggle.
if (!(window as unknown as { api?: unknown }).api) {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getOverlayPinned: async () => false,
    setOverlayPinned: () => {},
  }
}

/** The frame around every secondary overlay window (cheat sheets today, more
 *  tomorrow): drag-region header with the Scalpel icon, an optional left
 *  content slot for tabs, an optional right slot for view controls, and a
 *  close button on the far right. Stories use a fixed-height host so the
 *  Chrome's `h-screen` resolves to a sensible canvas size. */
const meta: Meta<typeof Chrome> = {
  title: 'Secondary Overlay / Chrome',
  component: Chrome,
  args: { onClose: () => {} },
  decorators: [
    (Story) => (
      <div className="w-[680px] h-[300px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof Chrome>

const PlaceholderBody = ({ text }: { text: string }): JSX.Element => (
  <div className="flex-1 flex items-center justify-center text-text-dim text-[12px]">{text}</div>
)

export const Bare: Story = {
  args: {
    children: <PlaceholderBody text="Just the chrome -- no headerContent, no headerEnd." />,
  },
}

export const WithCategoryTabs: Story = {
  args: {
    headerContent: (
      <>
        {['Maps', 'Currency', 'Heist'].map((name, i) => (
          <button
            key={name}
            className={`text-[10px] px-2 py-1 ${i === 0 ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
          >
            {name}
          </button>
        ))}
      </>
    ),
    children: <PlaceholderBody text="Cheat-sheets-style chrome with a tab strip on the left." />,
  },
}

export const WithSizeControls: Story = {
  args: {
    headerEnd: (
      <>
        <button className="w-6 h-6 flex items-center justify-center" style={{ color: '#fbbf24', lineHeight: 0 }}>
          <GridFour size={15} theme="outline" fill="currentColor" />
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text"
          style={{ lineHeight: 0 }}
        >
          <GridNine size={15} theme="outline" fill="currentColor" />
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text"
          style={{ lineHeight: 0 }}
        >
          <GridSixteen size={15} theme="outline" fill="currentColor" />
        </button>
      </>
    ),
    children: <PlaceholderBody text="Right-side view controls (e.g. thumbnail size picker)." />,
  },
}

export const Both: Story = {
  args: {
    headerContent: (
      <>
        {['All', 'Currency', 'Maps'].map((name, i) => (
          <button
            key={name}
            className={`text-[10px] px-2 py-1 ${i === 0 ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
          >
            {name}
          </button>
        ))}
      </>
    ),
    headerEnd: (
      <>
        <button className="w-6 h-6 flex items-center justify-center" style={{ color: '#fbbf24', lineHeight: 0 }}>
          <GridFour size={15} theme="outline" fill="currentColor" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center text-text-dim" style={{ lineHeight: 0 }}>
          <GridNine size={15} theme="outline" fill="currentColor" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center text-text-dim" style={{ lineHeight: 0 }}>
          <GridSixteen size={15} theme="outline" fill="currentColor" />
        </button>
      </>
    ),
    children: <PlaceholderBody text="Tabs left, view controls right -- the full cheat-sheets layout." />,
  },
}
