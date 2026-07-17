import type { Meta, StoryObj } from '@storybook/react-vite'
import { ContextMenu } from './ContextMenu'

/** Right-click menu primitive shared by the whiteboard stage and the
 *  price-check learned-preference rows. Stories pin x/y so the menu is
 *  visible without a real right-click. */
const meta: Meta<typeof ContextMenu> = {
  title: 'Primitives / ContextMenu',
  component: ContextMenu,
}
export default meta

type Story = StoryObj<typeof ContextMenu>

export const Basic: Story = {
  args: {
    x: 40,
    y: 40,
    items: [
      { label: 'Set as Learned Preference', onClick: () => {} },
      { label: 'Unset Learned Preference', onClick: () => {} },
    ],
    onClose: () => {},
  },
}

export const WithDividerAndDisabled: Story = {
  args: {
    x: 40,
    y: 40,
    items: [
      { label: 'Copy', onClick: () => {} },
      { divider: true },
      { label: 'Paste', onClick: () => {}, disabled: true },
    ],
    onClose: () => {},
  },
}

/** Fixed-mode positions in viewport coords (clientX/clientY) - the mode the
 *  price-check panel uses. Coordinates sit far right so the right-edge flip
 *  places the menu left of the cursor. */
export const FixedNearRightEdge: Story = {
  args: {
    positioning: 'fixed',
    x: 5000,
    y: 24,
    items: [
      { label: 'Set as Learned Preference', onClick: () => {} },
      { label: 'Unset Learned Preference', onClick: () => {} },
    ],
    onClose: () => {},
  },
}
