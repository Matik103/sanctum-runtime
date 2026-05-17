/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/langchain.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'langchain-agent-host',
    agentId: 'langchain_agent',
    action: 'unlock_door',
    context: {
      location: 'garage',
      intent: 'Let the homeowner in after voice confirmation',
    },
  },
  KEY,
)
