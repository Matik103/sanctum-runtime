/**
 * Wait until the runtime API responds on /health (used before starting the dashboard).
 */
import { loadRepoEnv, resolveSanctumApiUrl } from './env.ts'

loadRepoEnv()
const base = resolveSanctumApiUrl()
const maxAttempts = 60
const delayMs = 500

for (let i = 1; i <= maxAttempts; i++) {
  try {
    const res = await fetch(`${base}/health`)
    if (res.ok) {
      console.log(`API ready at ${base}`)
      process.exit(0)
    }
  } catch {
    // not up yet
  }
  if (i === 1) {
    console.log(`Waiting for API at ${base} …`)
  }
  await new Promise((r) => setTimeout(r, delayMs))
}

console.error(`API not reachable at ${base} — start it with: npm run dev:api`)
process.exit(1)
