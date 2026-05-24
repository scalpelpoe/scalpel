import type { Meta, StoryObj } from '@storybook/react-vite'
import { ErrorBanner } from './ErrorBanner'

/** Slim full-width banner at the top of a panel. Expands when `message` is
 *  non-null, collapses to zero height (with transition) when null. `tone`
 *  picks the background -- danger by default, warn for non-fatal advisories.
 *
 *  The non-`inline` mode positions the banner absolutely (top: 0); we wrap
 *  the relevant stories in a host with explicit height so the absolute
 *  positioning has somewhere to anchor. */
const meta: Meta<typeof ErrorBanner> = {
  title: 'Shared / ErrorBanner',
  component: ErrorBanner,
}
export default meta

type Story = StoryObj<typeof ErrorBanner>

const HostWithHeight = ({ children }: { children: React.ReactNode }): JSX.Element => (
  <div className="relative w-[420px] h-[80px] bg-bg-card rounded">{children}</div>
)

export const Empty: Story = {
  render: (args) => (
    <HostWithHeight>
      <ErrorBanner {...args} />
    </HostWithHeight>
  ),
  args: { message: null },
}

export const ErrorState: Story = {
  render: (args) => (
    <HostWithHeight>
      <ErrorBanner {...args} />
    </HostWithHeight>
  ),
  args: { message: 'Trade search failed: 429 Too Many Requests' },
}

export const Warn: Story = {
  render: (args) => (
    <HostWithHeight>
      <ErrorBanner {...args} />
    </HostWithHeight>
  ),
  args: { message: 'poe.ninja prices may be a few hours stale.', tone: 'warn' },
}

export const Inline: Story = {
  args: { message: 'A custom tag with the word "macro" already exists for this generator.', inline: true },
  parameters: {
    docs: {
      description: { story: 'Inline variant flows in document order instead of absolute-positioning.' },
    },
  },
}
