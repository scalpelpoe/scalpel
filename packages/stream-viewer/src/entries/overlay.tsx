import { createRoot } from 'react-dom/client'
import { OverlayView } from '../components/TwitchViews'
import '../styles'

createRoot(document.getElementById('root') as HTMLElement).render(<OverlayView ext={window.Twitch?.ext} />)
