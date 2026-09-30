import { createRoot } from 'react-dom/client'
import { ConfigPage } from '../components/ConfigPage'
import '../styles'
// The setup page wears the Scalpel home page's design, like the live site.
import '../../web/public/site.css'

document.body.classList.add('ssv-page')
createRoot(document.getElementById('root') as HTMLElement).render(<ConfigPage ext={window.Twitch?.ext} />)
