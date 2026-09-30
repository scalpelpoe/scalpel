import { createRoot } from 'react-dom/client'
import { PanelView } from '../components/TwitchViews'
import '../styles'

createRoot(document.getElementById('root') as HTMLElement).render(<PanelView ext={window.Twitch?.ext} />)
