import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConditionRow } from './ConditionRow'
import type { FilterCondition } from '@shared/types'

/** ConditionRow renders one line of a filter block: condition type
 *  (left, blue), an optional operator (e.g. ">="), and the value(s) (gold).
 *  BaseType conditions render their values as clickable ItemChips that
 *  switch the editor to the clicked base (via the lookupBaseType IPC stub
 *  installed in `.storybook/preview.tsx`); non-BaseType conditions show
 *  values as a plain string. */
const meta: Meta<typeof ConditionRow> = {
  title: 'Filter Block Editor / ConditionRow',
  component: ConditionRow,
  decorators: [
    (Story) => (
      <div className="bg-bg-card p-3 rounded text-[12px] w-[520px]">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ConditionRow>

const cond = (overrides: Partial<FilterCondition>): FilterCondition =>
  ({ type: 'ItemLevel', operator: '>=', values: ['84'], ...overrides }) as FilterCondition

export const NumericGTE: Story = {
  args: { cond: cond({ type: 'ItemLevel', operator: '>=', values: ['84'] }), itemClass: 'Body Armours' },
}

export const NumericExactNoOp: Story = {
  args: { cond: cond({ type: 'Quality', operator: '=', values: ['20'] }), itemClass: 'Boots' },
  parameters: {
    docs: { description: { story: '`=` operator is implicit and rendered without the symbol.' } },
  },
}

export const StringLike: Story = {
  args: { cond: cond({ type: 'Rarity', operator: '=', values: ['Unique'] }), itemClass: 'Belts' },
}

export const BaseTypeChips: Story = {
  args: {
    cond: cond({ type: 'BaseType', operator: '=', values: ['Glorious Plate', 'Astral Plate', 'Lion Pelt'] }),
    itemClass: 'Body Armours',
  },
  parameters: {
    docs: {
      description: {
        story: 'BaseType values render as clickable ItemChips (lookupBaseType IPC stubbed for the story).',
      },
    },
  },
}
