import { test, expect } from '@playwright/test'

const email = process.env.A2Z_USER_EMAIL || process.env.TEST_USER_EMAIL
const password = process.env.A2Z_USER_PASSWORD

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('#auth-email').fill(email!)
  await page.locator('#auth-password').fill(password!)
  await page.getByRole('button', { name: 'Sign in to control plane' }).click()
  await expect(page.getByRole('heading', { name: /overview|runtime trust/i })).toBeVisible({
    timeout: 45_000,
  })
  // Clear verification backlog so it does not block navigation (from E2E holds)
  const dismiss = page.getByRole('button', { name: /dismiss all from queue/i })
  if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dismiss.click()
  }
}

test.describe('Connect Agent — Live Feed visibility', () => {
  test('Live Feed shows proxy events from Connect Agent', async ({ page }) => {
    test.skip(!email || !password, 'Set A2Z_USER_EMAIL and A2Z_USER_PASSWORD')

    const errors: string[] = []
    page.on('response', (res) => {
      if (res.url().includes('my_profile') && res.status() >= 500) errors.push(`my_profile ${res.status()}`)
      if (res.url().includes('/rest/v1/') && res.status() >= 500) errors.push(`${res.status()} ${res.url()}`)
    })

    await signIn(page)
    await page.goto('/?page=live-feed')
    await expect(page.locator('h1.page-title', { hasText: 'Live Feed' })).toBeVisible({ timeout: 30_000 })

    // Events from Connect Agent or empty state
    await expect(
      page
        .getByText(/transfer_funds|send_email|unlock_door|connect_test|connect_verify|no tool calls yet|no held actions|held queue/i)
        .first(),
    ).toBeVisible({ timeout: 20_000 })

    expect(errors).toEqual([])
  })
})
