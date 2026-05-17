/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/finance.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'finance-agent',
    agentId: 'treasury_agent',
    action: 'transfer_funds',
    context: {
      amount: 25000,
      currency: 'USD',
      to: 'vendor@bank.com',
      purpose: 'Invoice #4421',
    },
  },
  KEY,
)
