import type { Meta, StoryObj } from '@storybook/react-vite'
import { PRESETS_BY_ID } from '@shared/theme/presets'
import { ConfigPage } from '../components/ConfigPage'
import { MobileView, OverlayView, PanelView } from '../components/TwitchViews'
import {
  fakeExt,
  PlayerFrame,
  playerFrame,
  realSnapshot,
  withFakeApi,
  withMissingProfile,
} from './story-data'
import '../../web/public/site.css'

const meta: Meta = {
  title: 'Stream/Twitch',
  decorators: [withFakeApi(realSnapshot)],
}
export default meta

type Story = StoryObj

/** The video overlay over a stand-in player. Click "GEAR" on the left edge. */
/** Left ring and body armour carry a price check: pin one, then use its Price check button. */
export const VideoOverlay: Story = {
  decorators: [PlayerFrame, withFakeApi(realSnapshot)],
  render: () => <OverlayView ext={fakeExt()} />,
}

/** The streamer's own Scalpel theme (Steam 2026 here, not the poe2 default) reaches the panel and the rune card. */
export const VideoOverlayCustomTheme: Story = {
  name: 'Video Overlay, custom theme',
  decorators: [PlayerFrame, withFakeApi(() => ({ ...realSnapshot(), theme: PRESETS_BY_ID.steam2026.palette }))],
  render: () => <OverlayView ext={fakeExt()} initiallyOpen />,
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

/** Twitch's extension settings frame; the page brings the home page's navy (site.css). */
export const Config: Story = {
  render: () => (
    <div style={{ width: 700 }}>
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
