import { createRoot } from 'react-dom/client'
import { MobileView } from '../components/TwitchViews'
import '../styles'

createRoot(document.getElementById('root') as HTMLElement).render(<MobileView ext={window.Twitch?.ext} />)
