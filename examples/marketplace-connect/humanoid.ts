/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/humanoid.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'humanoid-host',
    agentId: 'humanoid_agent',
    action: 'move_to_location',
    context: {
      location: 'kitchen',
      owner_sleeping: false,
      heard: 'Bring the tray to the kitchen.',
    },
  },
  KEY,
)
