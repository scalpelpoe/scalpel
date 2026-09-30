/** The slice of the Twitch Extension helper (twitch-ext.min.js) this viewer uses. */
export interface TwitchAuth {
  channelId: string
  clientId: string
  token: string
  userId: string
}

export interface TwitchContext {
  arePlayerControlsVisible?: boolean
  isFullScreen?: boolean
  isTheatreMode?: boolean
}

export type TwitchListener = (target: string, contentType: string, message: string) => void

export interface TwitchExt {
  onAuthorized(cb: (auth: TwitchAuth) => void): void
  onContext(cb: (context: TwitchContext, changed: string[]) => void): void
  listen(target: string, cb: TwitchListener): void
  unlisten(target: string, cb: TwitchListener): void
}

declare global {
  interface Window {
    Twitch?: { ext: TwitchExt }
  }
  interface ImportMetaEnv {
    readonly VITE_STREAM_API?: string
  }
}
