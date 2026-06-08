import type { Meta, StoryObj } from '@storybook/react-vite'
import { SaveButton } from './SaveButton'

/** Save button with three explicit states: dirty (gold + clickable), saving
 *  (faded), saved (green confirmation). Disabled when the filter has no
 *  pending changes AND hasn't just been saved. */
const meta: Meta<typeof SaveButton> = {
  title: 'Filter Panel / SaveButton',
  component: SaveButton,
  args: { onSave: () => {} },
  decorators: [
    (Story) => (
      <div className="inline-flex">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof SaveButton>

export const Dirty: Story = {
  args: { isDirty: true, isSaving: false, isSaved: false },
}

export const Saving: Story = {
  args: { isDirty: true, isSaving: true, isSaved: false },
}

export const Saved: Story = {
  args: { isDirty: false, isSaving: false, isSaved: true },
}

export const Idle: Story = {
  args: { isDirty: false, isSaving: false, isSaved: false },
  parameters: { docs: { description: { story: 'No changes + not just saved: button is disabled and dim.' } } },
}

export const CompactDirty: Story = {
  args: { isDirty: true, isSaving: false, isSaved: false, compact: true },
  parameters: { docs: { description: { story: 'Compact variant -- used inside the CollapsedHeader.' } } },
}
