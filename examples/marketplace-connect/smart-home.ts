/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/smart-home.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'smart-home-hub',
    agentId: 'home_agent',
    action: 'unlock_door',
    context: {
      location: 'front_door',
      time: '02:15 AM',
      owner_sleeping: true,
      heard: 'Unlock the front door for the guest.',
    },
  },
  KEY,
)
