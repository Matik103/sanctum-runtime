/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/healthcare.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'healthcare-host',
    agentId: 'care_agent',
    action: 'dispense',
    context: {
      patient_zone: 'ward-b',
      role: 'nurse',
      medication_id: 'med-8812',
    },
  },
  KEY,
)
