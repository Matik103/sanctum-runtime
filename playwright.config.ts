import { config as loadEnv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
loadEnv({ path: resolve(root, '.env.e2e.local') })
loadEnv({ path: resolve(root, '.env.a2z.local'), override: true })

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.A2Z_CONSOLE_URL || 'https://console.sanctumruntime.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { channel: 'chrome' } }],
})
