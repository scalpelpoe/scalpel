import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppWindow } from './AppWindow'
import './styles.css'

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <AppWindow />
  </StrictMode>,
)
