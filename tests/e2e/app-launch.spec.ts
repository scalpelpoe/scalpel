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
