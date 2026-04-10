import { BrowserWindow, ipcMain, session } from 'electron'
import Store from 'electron-store'
import { searchTrade, isBulkExchangeItem, getBulkExchangeId, searchBulkExchange } from '../trade/trade'
import type { StatFilter, TradeResult, BulkExchangeResult } from '../trade/trade'
import type { AppSettings } from '../../shared/types'
import { POE_WEBSITE } from '../../shared/endpoints'

async function clickTradeButton(
  queryId: string,
  listingId: string,
  league: string,
  buttonType: 'direct' | 'whisper',
): Promise<string> {
  const tradeUrl = `${POE_WEBSITE}/trade/search/${encodeURIComponent(league)}/${queryId}`

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
      },
      statFilters: StatFilter[],
    ): Promise<TradeResult> => {
      const league = store.get('league')
      return searchTrade(
        league,
        item,
        statFilters,
        store.get('tradeStatus') ?? 'available',
        store.get('tradePriceOption') ?? 'chaos_divine',
      )
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
    const loginWindow = new BrowserWindow({
      width: 800,
      height: 700,
      title: 'Login to pathofexile.com',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    loginWindow.loadURL(`${POE_WEBSITE}/login`)

    // Close window when user navigates to the account page (login complete)
    loginWindow.webContents.on('did-navigate', (_event, url) => {
      if (url.includes('pathofexile.com/my-account') || url === `${POE_WEBSITE}/`) {
        loginWindow.close()
      }
    })
  })

  ipcMain.handle('poe-check-auth', async (): Promise<{ loggedIn: boolean; accountName?: string }> => {
    try {
      const cookies = await session.defaultSession.cookies.get({ domain: 'pathofexile.com', name: 'POESESSID' })
      return { loggedIn: cookies.length > 0 }
    } catch {
      return { loggedIn: false }
    }
  })

  ipcMain.handle('poe-logout', async () => {
    await session.defaultSession.cookies.remove(POE_WEBSITE, 'POESESSID')
  })

  ipcMain.handle('open-external', (_event, url: string) => {
    require('electron').shell.openExternal(url)
  })
}
