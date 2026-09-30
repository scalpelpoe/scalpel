import { createRoot } from 'react-dom/client'
import { ConfigPage } from '../components/ConfigPage'
import '../styles'

createRoot(document.getElementById('root') as HTMLElement).render(<ConfigPage ext={window.Twitch?.ext} />)
