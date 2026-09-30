import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConfigPage } from '../components/ConfigPage'
import { MobileView, OverlayView, PanelView } from '../components/TwitchViews'
import { fakeExt, PlayerFrame, playerFrame, realSnapshot, withFakeApi, withMissingProfile } from './story-data'

const meta: Meta = {
  title: 'Stream/Twitch',
  decorators: [withFakeApi(realSnapshot)],
}
export default meta

type Story = StoryObj

/** The video overlay over a stand-in player. Click "GEAR" on the left edge. */
export const VideoOverlay: Story = {
  decorators: [PlayerFrame],
  render: () => <OverlayView ext={fakeExt()} />,
}

/** Twitch's screenshot slot is 4:3, at least 1024x768. This is a 1024x768 player drawn at 2x,
 *  opened: capture the frame (e.g. DevTools "Capture node screenshot") for a 2048x1536 image. */
export const VideoOverlayScreenshot: Story = {
  name: 'Video overlay 1024x768 @2x',
  decorators: [playerFrame(1024, 768, 2)],
  render: () => <OverlayView ext={fakeExt()} initiallyOpen />,
}

export const Mobile: Story = {
  render: () => (
    <div style={{ width: 380, background: '#0e0e10' }}>
      <MobileView ext={fakeExt()} />
    </div>
  ),
}

export const Panel: Story = {
  render: () => (
    <div style={{ width: 318, background: '#18181b' }}>
      <PanelView ext={fakeExt()} />
    </div>
  ),
}

export const Config: Story = {
  render: () => (
    <div style={{ width: 700, background: '#18181b' }}>
      <ConfigPage ext={fakeExt()} />
    </div>
  ),
}

export const NotSetUp: Story = {
  decorators: [withMissingProfile],
  render: () => (
    <div style={{ width: 380, background: '#0e0e10' }}>
      <MobileView ext={fakeExt()} />
    </div>
  ),
}
