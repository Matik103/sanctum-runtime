import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PolicyMap } from '@sanctum-runtime/sdk'

export function policiesPath(dataDir?: string): string {
  return join(dataDir ?? join(process.cwd(), 'data'), 'policies.json')
}

export async function loadPoliciesFromDisk(dataDir?: string): Promise<PolicyMap | null> {
  try {
    const raw = await readFile(policiesPath(dataDir), 'utf8')
    return JSON.parse(raw) as PolicyMap
  } catch {
    return null
  }
}

export async function savePoliciesToDisk(
  policies: PolicyMap,
  dataDir?: string,
): Promise<void> {
  const path = policiesPath(dataDir)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(policies, null, 2)}\n`, 'utf8')
}
