/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/embodied.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'embodied-ai-host',
    agentId: 'embodied_agent',
    action: 'grasp',
    context: {
      zone: 'pick-station',
      near_human: true,
      payload_id: 'crate-42',
    },
  },
  KEY,
)
