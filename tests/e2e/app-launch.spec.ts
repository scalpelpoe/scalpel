import { expect, test } from '@playwright/test'
import { launchScalpelE2E } from './helpers/electron'

test('launches the app window with preload API available', async () => {
  const scalpel = await launchScalpelE2E()
  try {
    await expect(scalpel.window.locator('body')).toBeVisible()
    await expect.poll(() => scalpel.window.evaluate(() => typeof window.api?.getSettings)).toBe('function')
  } finally {
    await scalpel.cleanup()
  }
})

test('clamps off-screen saved position on startup when onboarding completed', async () => {
  const scalpel = await launchScalpelE2E({
    seedConfig: {
      onboardingCompleted: true,
      startInTray: false,
      appWindowPosition: { x: 99999, y: 99999 },
    },
  })
  try {
    const page = scalpel.window
    await expect(page.locator('body')).toBeVisible()
    await expect.poll(() => page.evaluate(() => typeof window.api?.getSettings)).toBe('function')

    const state = await scalpel.app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const b = win.getBounds()
      const wa = screen.getPrimaryDisplay().workArea
      return {
        visible: win.isVisible(),
        bounds: b,
        workArea: wa,
      }
    })

    expect(state.visible).toBe(true)
    expect(state.bounds.x).toBeGreaterThanOrEqual(state.workArea.x)
    expect(state.bounds.y).toBeGreaterThanOrEqual(state.workArea.y)
    expect(state.bounds.x + state.bounds.width).toBeLessThanOrEqual(state.workArea.x + state.workArea.width)
    expect(state.bounds.y + state.bounds.height).toBeLessThanOrEqual(state.workArea.y + state.workArea.height)
  } finally {
    await scalpel.cleanup()
  }
})
