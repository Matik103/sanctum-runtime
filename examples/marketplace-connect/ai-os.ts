/**
 *   SANCTUM_API_KEY=... npx tsx examples/marketplace-connect/ai-os.ts
 */
import { runPackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

await runPackageDemo(
  {
    slug: 'ai-os-host',
    agentId: 'os_agent',
    action: 'install_package',
    context: {
      package: 'devtools-cli',
      path: '/usr/local/bin',
      privilege: 'admin',
    },
  },
  KEY,
)
