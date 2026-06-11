import { test, expect } from '@playwright/test'
import {
  attachErrorCollectors,
  consoleEmail,
  consolePassword,
  dismissVerificationQueue,
  loginToConsole,
} from './helpers'

test.describe('Sanctum console production smoke', () => {
  test('login → overview → key pages without 500 errors', async ({ page }) => {
    test.skip(!consoleEmail || !consolePassword, 'Set A2Z_USER_EMAIL and A2Z_USER_PASSWORD')

    const errors = attachErrorCollectors(page)
    await loginToConsole(page)
    await dismissVerificationQueue(page)

    const pages: { nav: RegExp; heading: RegExp }[] = [
      { nav: /^connect agent$|^connect$/i, heading: /connect/i },
      { nav: /^live feed$|^live$/i, heading: /live feed|live/i },
      { nav: /^policies$/i, heading: /polic/i },
      { nav: /^billing$/i, heading: /billing|plan/i },
      { nav: /^settings$/i, heading: /settings|account/i },
    ]

    for (const { nav, heading } of pages) {
      await page.getByRole('button', { name: nav }).first().click({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 25_000 })
    }

    expect(errors, errors.join('\n')).toEqual([])
  })
})
