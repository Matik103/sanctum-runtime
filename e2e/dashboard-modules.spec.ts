import { test, expect } from '@playwright/test'
import {
  assertModulePage,
  attachErrorCollectors,
  consoleEmail,
  consolePassword,
  dismissVerificationQueue,
  loginToConsole,
} from './helpers'

/** All sidebar destinations (matches apps/dashboard/src/layout/Sidebar.tsx NAV). */
const MODULE_PAGES: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^overview$/i, heading: /overview|runtime status/i },
  { nav: /^runtime activity$|^activity$/i, heading: /runtime activity/i },
  { nav: /^threat monitor$|^threats$/i, heading: /threat monitor/i },
  { nav: /^sanctum shield$|^shield$/i, heading: /sanctum shield/i },
  { nav: /^shield rules$|^s\.rules$/i, heading: /shield rules/i },
  { nav: /^alerts$/i, heading: /^alerts$/i },
  { nav: /^policies$/i, heading: /^policies$/i },
  { nav: /^policy history$|^history$/i, heading: /policy history/i },
  { nav: /^policy composer$|^composer$/i, heading: /policy composer|workflow builder/i },
  { nav: /^assurance$/i, heading: /^assurance$/i },
  { nav: /^governance$/i, heading: /^governance$/i },
  { nav: /^permission graph$|^permissions$/i, heading: /permission graph/i },
  { nav: /^compliance$/i, heading: /^compliance$/i },
  { nav: /^agents$/i, heading: /^agents$/i },
  { nav: /^devices$/i, heading: /devices.*api keys/i },
  { nav: /^runtime fleet$|^fleet$/i, heading: /runtime fleet/i },
  { nav: /^marketplace$|^market$/i, heading: /^marketplace$/i },
  { nav: /^audit logs$|^audit$/i, heading: /audit logs/i },
  { nav: /^billing$/i, heading: /billing/i },
  { nav: /^settings$/i, heading: /^settings$/i },
  { nav: /^connect agent$|^connect$/i, heading: /connect/i },
  { nav: /^live feed$|^live$/i, heading: /live feed/i },
]

test.describe('Sanctum console — all modules', () => {
  test('login → every sidebar page loads without 500s', async ({ page }) => {
    test.skip(!consoleEmail || !consolePassword, 'Set A2Z_USER_EMAIL and A2Z_USER_PASSWORD')

    const errors = attachErrorCollectors(page)
    await loginToConsole(page)
    await dismissVerificationQueue(page)

    for (const { nav, heading } of MODULE_PAGES) {
      await page.getByRole('button', { name: nav }).first().click({ timeout: 20_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await assertModulePage(page, heading, nav.source)
      await page.waitForTimeout(400)
    }

    expect(errors, errors.join('\n')).toEqual([])
  })
})
