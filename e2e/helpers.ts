import { expect, type Page } from '@playwright/test'

export const consoleEmail = process.env.A2Z_USER_EMAIL || process.env.TEST_USER_EMAIL
export const consolePassword = process.env.A2Z_USER_PASSWORD

export async function loginToConsole(page: Page) {
  await page.goto('/')
  await page.locator('#auth-email').fill(consoleEmail!)
  await page.locator('#auth-password').fill(consolePassword!)
  await page.getByRole('button', { name: 'Sign in to control plane' }).click()
  await expect(
    page.getByRole('heading', { name: /overview|runtime trust|runtime status/i }),
  ).toBeVisible({ timeout: 45_000 })
}

export async function dismissVerificationQueue(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss all from queue' })
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click()
    await page.waitForTimeout(500)
  }
}

export async function assertModulePage(page: Page, heading: RegExp, pageName: string) {
  const boundary = page.getByText(/failed to load/i)
  if (await boundary.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const retry = page.getByRole('button', { name: /try again|refresh app/i })
    if (await retry.isVisible().catch(() => false)) {
      await retry.click()
      await page.waitForTimeout(1_500)
    }
  }
  if (await boundary.isVisible({ timeout: 2_000 }).catch(() => false)) {
    throw new Error(`${pageName} hit error boundary (deploy latest console for Devices fix if applicable)`)
  }
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 30_000 })
}

export function attachErrorCollectors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text()
      if (/500|Internal Server Error|my_profile/.test(t)) errors.push(t)
    }
  })
  page.on('response', (res) => {
    if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`)
  })
  return errors
}
