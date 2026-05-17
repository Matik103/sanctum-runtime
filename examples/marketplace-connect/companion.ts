/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/companion.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'companion-host',
    agentId: 'companion_agent',
    action: 'place_order',
    context: {
      channel: 'in_app',
      user_id: 'user-42',
      consent: true,
      item: 'flowers',
    },
  },
  KEY,
)
