import { renderToStaticMarkup } from 'react-dom/server'

export const ECONOMY_ICON = renderToStaticMarkup(
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <circle cx="24" cy="24" r="16" opacity="0.35" />
    <path d="M24 14v20M18 20h12M18 28h8" strokeLinecap="round" />
    <path d="M32 32l6 6" strokeLinecap="round" />
  </svg>,
)
