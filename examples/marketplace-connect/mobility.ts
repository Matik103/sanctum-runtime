/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/mobility.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'mobility-host',
    agentId: 'nav_agent',
    action: 'change_route',
    context: {
      route_id: 'route-west-7',
      occupancy: 'low',
      weather: 'clear',
    },
  },
  KEY,
)
