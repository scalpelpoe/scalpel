import { expect, test } from '@playwright/test'
import { launchScalpelE2E } from './helpers/electron'

// Opt-in: needs a running scalpel-stream-api and live poe.ninja.
//   npm run db:migrate:local --prefix C:/www/scalpel-stream-api
//   npm run dev --prefix C:/www/scalpel-stream-api
//   SCALPEL_STREAM_API=http://127.0.0.1:8787 npm run test:e2e -- tests/e2e/stream-settings.spec.ts
const api = process.env.SCALPEL_STREAM_API
const shot = process.env.SCALPEL_STREAM_E2E_SCREENSHOT

interface StreamApi {
  api: {
    streamGetOverview: () => Promise<{
      settings: { enabled: boolean; profileId: string | null }
      publisher: { version: number | null; character: { name: string } | null }
      publicUrl: string | null
    }>
  }
}

test.skip(!api, 'set SCALPEL_STREAM_API to a running scalpel-stream-api')

test('Scalpel Stream section enables, pairs and publishes a real character', async () => {
  test.setTimeout(90_000)
  // A bare onboardingCompleted seed is reset by the legacy-profile migration; a legacy
  // filter path makes the migration create a profile and mark onboarding done itself.
  // Scalpel Stream is its own Settings tab, shown only in PoE2 mode.
  const scalpel = await launchScalpelE2E({
    seedConfig: { filterPathPoe2: 'C:\\e2e\\dummy.filter', poeVersion: 2, startInTray: false },
  })
  try {
    const page = scalpel.window
    await page.getByRole('button', { name: 'Stream', exact: true }).click({ timeout: 20_000 })
    const toggle = page.getByText('Share my PoE2 gear with stream viewers')
    await expect(toggle).toBeVisible({ timeout: 20_000 })
    await toggle.click()

    await expect(page.getByText('Path of Exile account')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Get pairing code' }).click()
    await expect(page.locator('.font-mono')).toHaveText(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/)

    const account = page.getByPlaceholder('Name#1234')
    await account.fill('aer0_#2690')
    await account.press('Enter')
    await page.getByRole('button', { name: 'Push now' }).click()
    await expect(page.getByText(/Up to date/)).toBeVisible({ timeout: 45_000 })

    const overview = await page.evaluate(() => (window as unknown as StreamApi).api.streamGetOverview())
    expect(overview.settings.enabled).toBe(true)
    expect(overview.publisher.version).toBeGreaterThanOrEqual(1)
    expect(overview.publisher.character?.name).toBeTruthy()
    expect(overview.publicUrl).toMatch(/\/p\/[a-z0-9]+$/)
    if (shot) {
      await page.getByText('Scalpel Stream', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: shot })
    }
  } finally {
    await scalpel.cleanup()
  }
})
