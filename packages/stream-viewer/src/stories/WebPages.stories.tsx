import type { Meta, StoryObj } from '@storybook/react-vite'
import { WebApp } from '../components/WebApp'
import type { WebSource } from '../entries/routes'
import { PlayerFrame, realSnapshot, withFakeApi, withMissingProfile } from './story-data'
// The site-wide stylesheet the real pages load from web/index.html.
import '../../web/public/site.css'

const meta: Meta = {
  title: 'Stream/Web',
  decorators: [withFakeApi(realSnapshot)],
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj

const channel: WebSource = { kind: 'slug', slug: 'aer0__' }

/** live.scalpel.fourth.party/<channel> (and /p/<profileId>): the public gear page. */
export const PublicPage: Story = {
  render: () => <WebApp route={{ view: 'page', source: channel }} />,
}

/** <channel>/obs: the default OBS browser source, over a stand-in stream. */
export const ObsCompact: Story = {
  decorators: [PlayerFrame],
  parameters: { layout: 'padded' },
  render: () => <WebApp route={{ view: 'obs', source: channel, layout: 'compact' }} />,
}

/** <channel>/obs?layout=full */
export const ObsFull: Story = {
  decorators: [PlayerFrame],
  parameters: { layout: 'padded' },
  render: () => <WebApp route={{ view: 'obs', source: channel, layout: 'full' }} />,
}

export const PageHidden: Story = {
  decorators: [withFakeApi(realSnapshot, { state: 'hidden' })],
  render: () => <WebApp route={{ view: 'page', source: channel }} />,
}

export const PageNotSetUp: Story = {
  decorators: [withMissingProfile],
  render: () => <WebApp route={{ view: 'page', source: { kind: 'slug', slug: 'nobody' } }} />,
}

/** live.scalpel.fourth.party/ */
export const Landing: Story = {
  render: () => <WebApp route={{ view: 'landing' }} />,
}
