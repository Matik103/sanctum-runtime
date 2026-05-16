import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const envFile = resolve(root, '.env')

if (!existsSync(envFile)) {
  console.error(`
Missing .env in ${root}

  cp .env.example .env
  # Edit hosts and ports for your machine, then run again.
`)
  process.exit(1)
}
