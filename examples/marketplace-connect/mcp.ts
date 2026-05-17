/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/mcp.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'mcp-server-host',
    agentId: 'mcp_host',
    action: 'transfer_funds',
    context: { amount: 500, to_account: 'ops-vault', tool: 'transfer_funds' },
  },
  KEY,
)
