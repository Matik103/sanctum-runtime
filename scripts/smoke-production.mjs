/**
 * Full production smoke: health checks + control plane E2E.
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=sk_sanctum_... [SANCTUM_ORG_ID=...] \
 *   npm run smoke:production
 */
import { spawn } from 'node:child_process'

const env = { ...process.env }

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    })
  })
}

async function main() {
  if (!process.env.SANCTUM_API_URL) {
    console.error('Set SANCTUM_API_URL')
    process.exit(1)
  }

  console.log('=== Production check ===\n')
  await run('npm', ['run', 'production:check'])

  if (!process.env.SANCTUM_API_KEY?.trim()) {
    console.log('\n○ Skip control-plane smoke (set SANCTUM_API_KEY=sk_sanctum_...)')
    process.exit(0)
  }

  console.log('\n=== Control plane smoke ===\n')
  await run('npm', ['run', 'smoke:control-plane'])

  console.log('\n✓ Production smoke complete')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
