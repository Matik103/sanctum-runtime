import { test, expect } from '@playwright/test'
import {
  attachErrorCollectors,
  consoleEmail,
  consolePassword,
  dismissVerificationQueue,
  loginToConsole,
} from './helpers'

test.describe('Marketplace UI', () => {
  test('browse catalog, install connect-agent-starter, uninstall', async ({ page }) => {
    test.skip(!consoleEmail || !consolePassword, 'Set A2Z_USER_EMAIL and A2Z_USER_PASSWORD')

    const errors = attachErrorCollectors(page)
    await loginToConsole(page)
    await dismissVerificationQueue(page)

    await page.getByRole('button', { name: /^marketplace$|^market$/i }).first().click({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /^marketplace$/i })).toBeVisible({ timeout: 25_000 })

    const starterCard = page.locator('.marketplace-card').filter({ hasText: /Connect Agent Starter/i })
    await expect(starterCard).toBeVisible({ timeout: 15_000 })

    const installBtn = starterCard.getByRole('button', { name: /^install$/i })
    const uninstallBtn = starterCard.getByRole('button', { name: /^uninstall$/i })

    if (await uninstallBtn.isVisible().catch(() => false)) {
      await uninstallBtn.click()
      await expect(starterCard.getByText(/installed/i)).not.toBeVisible({ timeout: 30_000 })
    }

    await installBtn.click()
    await expect(starterCard.locator('.badge.success', { hasText: /installed/i })).toBeVisible({ timeout: 45_000 })

    await starterCard.getByRole('button', { name: /^details$/i }).click()
    const modal = page.locator('.card').filter({ has: page.getByRole('heading', { level: 2, name: /Connect Agent Starter/i }) })
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(modal.getByText(/policy templates/i)).toBeVisible()
    await page.getByRole('button', { name: /^close$/i }).click()

    await starterCard.getByRole('button', { name: /^uninstall$/i }).click()
    await expect(starterCard.getByRole('button', { name: /^install$/i })).toBeVisible({ timeout: 45_000 })

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('starter pack filters narrow the grid', async ({ page }) => {
    test.skip(!consoleEmail || !consolePassword, 'Set A2Z_USER_EMAIL and A2Z_USER_PASSWORD')

    await loginToConsole(page)
    await dismissVerificationQueue(page)

    await page.getByRole('button', { name: /^marketplace$|^market$/i }).first().click()
    await expect(page.getByRole('heading', { name: /^marketplace$/i })).toBeVisible({ timeout: 25_000 })

    const allCards = page.locator('.marketplace-card')
    const allCount = await allCards.count()
    test.skip(allCount < 2, 'Need multiple packages for filter test')

    await page.getByRole('button', { name: /Physical & access control/i }).click()
    await expect(allCards.first()).toBeVisible()
    const filtered = await allCards.count()
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThanOrEqual(allCount)
  })
})
