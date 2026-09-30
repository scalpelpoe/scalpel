import { createRoot } from 'react-dom/client'
import { WebApp } from '../components/WebApp'
import '../styles'
import { parseRoute } from './routes'

const route = parseRoute(window.location.pathname, window.location.search)
createRoot(document.getElementById('root') as HTMLElement).render(<WebApp route={route} />)
