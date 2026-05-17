/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/ros2.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'ros2-mobile',
    agentId: 'ros2_controller',
    action: 'move_robot',
    context: { zone: 'warehouse', speed: 'normal', frame: 'map' },
  },
  KEY,
)
