import type { Api } from '../../preload'

declare global {
  const __APP_VERSION__: string

  interface Window {
    api: Api
    __SCALPEL_DEBUG_LOG?: boolean
  }
}

export {}
