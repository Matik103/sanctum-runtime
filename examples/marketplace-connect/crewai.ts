/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/crewai.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'crewai-crew-host',
    agentId: 'crew_agent',
    action: 'robot_arm_move',
    context: { x: 1.2, y: 0.4, z: 0.8, task: 'pick_palette' },
  },
  KEY,
)
