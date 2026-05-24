import { app, BrowserWindow, ipcMain, net, session } from 'electron'
import Store from 'electron-store'
import {
  searchTrade,
  searchNeedsLogin,
  fetchMoreListings,
  isBulkExchangeItem,
  getBulkExchangeId,
  searchBulkExchange,
  searchMapsByRegex,
} from '../trade/trade'
import type { StatFilter, TradeResult, BulkExchangeResult } from '../trade/trade'
import type { AppSettings, AuthResult } from '../../shared/types'
import { POE_WEBSITE, getTradeUrls } from '../../shared/endpoints'
import { getPoeVersion } from '../game-state'

async function clickTradeButton(
  queryId: string,
  listingId: string,
  league: string,
  buttonType: 'direct' | 'whisper',
): Promise<string> {
  const tradeUrl = getTradeUrls(getPoeVersion()).webSearch(league, queryId)

  // Use a separate session partition but copy the POESESSID cookie from the default session
  const tradeSession = session.fromPartition('trade-headless', { cache: false })

  // Copy all pathofexile.com cookies from default session (POESESSID, cf_clearance, etc.)
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.pathofexile.com' })
    const cookies2 = await session.defaultSession.cookies.get({ domain: 'pathofexile.com' })
    const cookies3 = await session.defaultSession.cookies.get({ domain: 'www.pathofexile.com' })
    for (const cookie of [...cookies, ...cookies2, ...cookies3]) {
      await tradeSession.cookies
        .set({
          url: POE_WEBSITE,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain ?? '.pathofexile.com',
          path: cookie.path ?? '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
        })
        .catch(() => {})
    }
  } catch {
    /* no cookies */
  }

  const hiddenWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: tradeSession,
    },
  })

  // Block images, fonts, stylesheets, media to speed up page load
  tradeSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = details.url
    if (
      url.endsWith('.png') ||
      url.endsWith('.jpg') ||
      url.endsWith('.gif') ||
      url.endsWith('.webp') ||
      url.endsWith('.woff') ||
      url.endsWith('.woff2') ||
      url.endsWith('.ttf') ||
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('sentry') ||
      url.includes('analytics')
    ) {
      callback({ cancel: true })
    } else {
      callback({})
    }
  })

  let clicked = 'timeout'
  try {
    await hiddenWindow.loadURL(tradeUrl)

    // Poll for results to appear instead of fixed delay
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 250))
      // Direct Whisper button handles both: sends whisper for in-person, travels to hideout for instant buyout
      const btnSelector = '.direct-btn'
      // Sanitize listingId to prevent JS injection via executeJavaScript
      const safeId = JSON.stringify(listingId)
      const safeBtnSel = JSON.stringify(btnSelector)
      const safeType = JSON.stringify(buttonType)
      const result = await hiddenWindow.webContents.executeJavaScript(`
        (function() {
          const targetId = ${safeId};
          const rows = document.querySelectorAll('[data-id]');
          for (const row of rows) {
            if (row.getAttribute('data-id') === targetId) {
              const btn = row.querySelector(${safeBtnSel});
              if (btn) { btn.click(); return 'clicked-' + ${safeType}; }
              return 'no-button-found';
            }
          }
          return rows.length > 0 ? 'listing-not-found' : 'loading';
        })()
      `)
      if (result !== 'loading') {
        clicked = result
        break
      }
    }

    // Brief pause for the action to process
    await new Promise((r) => setTimeout(r, 500))
  } catch (e) {
    console.error(`[trade] ${buttonType} failed:`, e)
  } finally {
    hiddenWindow.close()
  }
  return clicked
}

function fetchPoeProfile(): Promise<AuthResult> {
  return new Promise<AuthResult>((resolve) => {
    const request = net.request({
      url: `${POE_WEBSITE}/api/profile`,
      method: 'GET',
      useSessionCookies: true,
    })
    request.setHeader('Accept', 'application/json')
    request.setHeader('User-Agent', app.userAgentFallback)

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      request.abort()
      console.error('[auth] profile check timed out')
      resolve({ loggedIn: false })
    }, 5000)

    let data = ''
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({ loggedIn: false })
        return
      }
      response.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })
      response.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        try {
          const profile = JSON.parse(data) as { name?: string }
          if (profile?.name) {
            resolve({ loggedIn: true, accountName: profile.name })
          } else {
            console.warn('[auth] profile response has no name field, raw:', data)
            resolve({ loggedIn: false })
          }
        } catch (e) {
          console.error('[auth] profile JSON parse failed:', e, 'raw:', data)
          resolve({ loggedIn: false })
        }
      })
    })
    request.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ loggedIn: false })
    })
    request.end()
  })
}

// Session-cached login state for gating weighted-sum searches. Refreshed lazily
// (only when a search actually needs it) and cleared on login/logout so a fresh
// login takes effect immediately; the TTL re-validates against server-side
// session expiry without a network call on every search.
let authCache: { loggedIn: boolean; at: number } | null = null
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000

function setAuthCache(loggedIn: boolean): void {
  authCache = { loggedIn, at: Date.now() }
}

// Fresh login check (uncached): no POESESSID cookie means logged out; otherwise
// the profile endpoint decides. Shared by the cached gate and the poe-check-auth
// IPC so the cookie + profile sequence lives in one place.
async function checkAuthFresh(): Promise<AuthResult> {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: 'pathofexile.com', name: 'POESESSID' })
    if (cookies.length === 0) return { loggedIn: false }
    return await fetchPoeProfile()
  } catch {
    return { loggedIn: false }
  }
}

async function isLoggedInCached(): Promise<boolean> {
  if (authCache && Date.now() - authCache.at < AUTH_CACHE_TTL_MS) return authCache.loggedIn
  const { loggedIn } = await checkAuthFresh()
  setAuthCache(loggedIn)
  return loggedIn
}

export function register(store: Store<AppSettings>): void {
  ipcMain.handle(
    'trade-search',
    async (
      _event,
      item: {
        name: string
        baseType: string
        itemClass: string
        rarity: string
        armour?: number
        evasion?: number
        energyShield?: number
        ward?: number
        block?: number
        vaalGem?: boolean
      },
      statFilters: StatFilter[],
      searchOptions?: { listedTime?: string; priceOption?: string; statusOption?: string },
    ): Promise<TradeResult> => {
      const league = store.get('league')
      // Per-search overrides from the price-check Settings chip take priority over the
      // persisted global settings.
      const status = searchOptions?.statusOption ?? store.get('tradeStatus') ?? 'available'
      const price = searchOptions?.priceOption ?? store.get('tradePriceOption') ?? 'chaos_divine'
      const collapse = store.get('tradeCollapseListings') ?? true
      // Only spend a login check when the search would carry a Weighted Sum group
      // (the trade API rejects those for anonymous users). Most searches skip it.
      const loggedIn = searchNeedsLogin(statFilters) ? await isLoggedInCached() : true
      return searchTrade(league, item, statFilters, {
        tradeStatus: status,
        tradePriceOption: price,
        listedTime: searchOptions?.listedTime,
        collapseListings: collapse,
        loggedIn,
      })
    },
  )

  ipcMain.handle(
    'bulk-exchange',
    async (_event, itemName: string, baseType: string, haveId?: string): Promise<BulkExchangeResult> => {
      const league = store.get('league')
      const wantId = getBulkExchangeId(itemName, baseType)
      if (!wantId) return { total: 0, listings: [], queryId: '' }
      return searchBulkExchange(league, wantId, haveId ?? 'chaos')
    },
  )

  ipcMain.handle(
    'check-bulk-item',
    (_event, itemName: string, baseType: string, itemClass: string, rarity?: string): boolean => {
      return isBulkExchangeItem(itemClass, itemName, baseType, rarity)
    },
  )

  ipcMain.handle('visit-hideout', async (_event, queryId: string, listingId: string, league: string) => {
    return clickTradeButton(queryId, listingId, league, 'direct')
  })

  ipcMain.handle('whisper-seller', async (_event, queryId: string, listingId: string, league: string) => {
    return clickTradeButton(queryId, listingId, league, 'whisper')
  })

  ipcMain.handle('poe-login', () => {
    return new Promise<void>((resolve) => {
      const LOGIN_TITLE = 'Login'
      const loginWindow = new BrowserWindow({
        width: 800,
        height: 700,
        title: LOGIN_TITLE,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })
      // The PoE login page sets document.title to "Path of Exile", which our overlay
      // matches by-title and would incorrectly attach to this login popup. Suppress the
      // OS title update and re-assert our own title in case preventDefault alone isn't
      // enough on some Windows setups.
      loginWindow.webContents.on('page-title-updated', (event) => {
        event.preventDefault()
        loginWindow.setTitle(LOGIN_TITLE)
      })
      loginWindow.loadURL(`${POE_WEBSITE}/login`)

      // Close window when user navigates to the account page (login complete)
      loginWindow.webContents.on('did-navigate', (_event, url) => {
        if (url.includes('pathofexile.com/my-account') || url === `${POE_WEBSITE}/`) {
          loginWindow.close()
        }
      })

      // Resolve after the window closes (user logged in or closed without logging
      // in). Drop the cached login state so the next weighted search re-checks.
      loginWindow.on('closed', () => {
        authCache = null
        resolve()
      })
    })
  })

  ipcMain.handle('poe-check-auth', async (): Promise<AuthResult> => {
    // Warm the weighted-search login cache from the renderer's own auth check.
    const result = await checkAuthFresh()
    setAuthCache(result.loggedIn)
    return result
  })

  ipcMain.handle('poe-logout', async () => {
    await session.defaultSession.cookies.remove(POE_WEBSITE, 'POESESSID')
    setAuthCache(false)
  })

  ipcMain.handle('open-external', (_event, url: string) => {
    require('electron').shell.openExternal(url)
  })

  ipcMain.handle(
    'map-regex-trade',
    async (
      _event,
      params: {
        tier: number
        avoidTexts: string[]
        wantTexts: string[]
        wantMode: 'any' | 'all'
        qualifiers: Record<string, number>
        nightmare: boolean
        originator: boolean
        corrupted8mod: boolean
      },
    ) => {
      const league = store.get('league')
      const tradeStatus = store.get('tradeStatus') ?? 'available'
      const tradePriceOption = store.get('tradePriceOption') ?? 'chaos_divine'
      const collapse = store.get('tradeCollapseListings') ?? true
      const result = await searchMapsByRegex(
        league,
        params.tier,
        params.avoidTexts,
        params.wantTexts,
        params.wantMode,
        params.qualifiers,
        params.nightmare,
        params.originator,
        params.corrupted8mod,
        tradeStatus,
        tradePriceOption,
        collapse,
      )
      return { ...result, league }
    },
  )

  ipcMain.handle('fetch-more-listings', async (_event, queryId: string, ids: string[]) => {
    return fetchMoreListings(queryId, ids)
  })
}
