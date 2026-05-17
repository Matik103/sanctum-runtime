/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/industrial.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'industrial-host',
    agentId: 'plc_agent',
    action: 'start_line',
    context: {
      line_id: 'line-3',
      shift: 'night',
      safety_interlock: 'engaged',
    },
  },
  KEY,
)
