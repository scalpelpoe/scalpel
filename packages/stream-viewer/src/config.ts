/** Worker base URL. Override with VITE_STREAM_API (e.g. http://127.0.0.1:8787) for local testing. */
export const API_BASE: string = import.meta.env.VITE_STREAM_API ?? 'https://api.scalpel.fourth.party'

/** "Powered by Scalpel" goes to the Scalpel Stream landing page: it explains the extension and
 *  has no download button (Twitch policy). */
export const ABOUT_URL = 'https://live.scalpel.fourth.party/'

/** Scalpel's own site, linked from the landing page. */
export const SCALPEL_SITE_URL = 'https://scalpel.fourth.party'

/** Gear older than this is flagged as stale. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000

/** Snapshot versions arrive over PubSub; spread the refetch so a big channel doesn't stampede. */
export const PUBSUB_JITTER_MS = 3000

/** Head re-check cadence: slow on Twitch (PubSub carries updates), faster on the web (no PubSub). */
export const TWITCH_POLL_MS = 5 * 60 * 1000
export const WEB_POLL_MS = 60 * 1000
