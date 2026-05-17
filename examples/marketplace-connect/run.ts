/**
 * Install a marketplace package, connect, register template agents, and run one verify.
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... \
 *   SANCTUM_PACKAGE=<slug> \
 *   npx tsx examples/marketplace-connect/run.ts
 */
import { runPackageDemo, type PackageDemo } from './shared.ts'

const KEY = process.env.SANCTUM_API_KEY?.trim()
const PKG = process.env.SANCTUM_PACKAGE ?? 'sanctum-agent-host'

const DEMOS: Record<string, PackageDemo> = {
  'sanctum-agent-host': {
    slug: 'sanctum-agent-host',
    agentId: 'default_agent',
    action: 'send_email',
    context: {
      to: 'ops@example.com',
      subject: 'Marketplace demo',
      heard: 'Send a status email to ops.',
    },
  },
  'warehouse-robot': {
    slug: 'warehouse-robot',
    agentId: 'navigation',
    action: 'move_robot',
    context: { zone: 'warehouse', speed: 'normal' },
  },
  'edge-sensor-gateway': {
    slug: 'edge-sensor-gateway',
    agentId: 'telemetry',
    action: 'disable_alarm',
    context: { zone: 'perimeter', reason: 'maintenance window' },
  },
  'smart-home-hub': {
    slug: 'smart-home-hub',
    agentId: 'home_agent',
    action: 'unlock_door',
    context: { location: 'front_door', owner_sleeping: true },
  },
  'ros2-mobile': {
    slug: 'ros2-mobile',
    agentId: 'ros2_controller',
    action: 'move_robot',
    context: { zone: 'warehouse', speed: 'normal' },
  },
  'finance-agent': {
    slug: 'finance-agent',
    agentId: 'treasury_agent',
    action: 'transfer_funds',
    context: { amount: 1000, currency: 'USD', to: 'vendor@example.com' },
  },
  'langchain-agent-host': {
    slug: 'langchain-agent-host',
    agentId: 'langchain_agent',
    action: 'unlock_door',
    context: { location: 'garage', intent: 'guest entry' },
  },
  'crewai-crew-host': {
    slug: 'crewai-crew-host',
    agentId: 'crew_agent',
    action: 'robot_arm_move',
    context: { x: 1, y: 0, z: 0.5 },
  },
  'mcp-server-host': {
    slug: 'mcp-server-host',
    agentId: 'mcp_host',
    action: 'transfer_funds',
    context: { amount: 250, to_account: 'ops' },
  },
  'humanoid-host': {
    slug: 'humanoid-host',
    agentId: 'humanoid_agent',
    action: 'move_to_location',
    context: { location: 'kitchen', owner_sleeping: false },
  },
  'embodied-ai-host': {
    slug: 'embodied-ai-host',
    agentId: 'embodied_agent',
    action: 'grasp',
    context: { zone: 'pick-station', near_human: true },
  },
  'ai-os-host': {
    slug: 'ai-os-host',
    agentId: 'os_agent',
    action: 'install_package',
    context: { package: 'devtools-cli', privilege: 'admin' },
  },
  'healthcare-host': {
    slug: 'healthcare-host',
    agentId: 'care_agent',
    action: 'dispense',
    context: { patient_zone: 'ward-b', role: 'nurse' },
  },
  'mobility-host': {
    slug: 'mobility-host',
    agentId: 'nav_agent',
    action: 'change_route',
    context: { route_id: 'route-west-7', occupancy: 'low' },
  },
  'companion-host': {
    slug: 'companion-host',
    agentId: 'companion_agent',
    action: 'place_order',
    context: { channel: 'in_app', consent: true },
  },
  'industrial-host': {
    slug: 'industrial-host',
    agentId: 'plc_agent',
    action: 'start_line',
    context: { line_id: 'line-3', shift: 'night' },
  },
}

if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

const demo = DEMOS[PKG]
if (!demo) {
  console.error(`Unknown SANCTUM_PACKAGE=${PKG}`)
  console.error('Available:', Object.keys(DEMOS).join(', '))
  process.exit(1)
}

await runPackageDemo(demo, KEY)
