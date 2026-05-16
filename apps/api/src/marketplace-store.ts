import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type RuntimePackage = {
  id: string
  slug: string
  name: string
  description: string | null
  version: string
  publisher: string
  category: string
  visibility: 'public' | 'org'
  org_id: string | null
  connect_defaults: Record<string, unknown>
  policy_templates: unknown[]
  readme: string | null
  created_at: string
  updated_at: string
}

export type RuntimePackageInstall = {
  id: string
  org_id: string
  package_id: string
  config: Record<string, unknown>
  installed_at: string
}

export type MarketplacePackageView = RuntimePackage & {
  installed: boolean
  installId: string | null
}

export class MarketplaceStore {
  constructor(private supabase: SupabaseAuthConfig) {}

  private admin() {
    return createSupabaseAdmin(this.supabase)
  }

  async listPackages(orgId?: string): Promise<MarketplacePackageView[]> {
    const admin = this.admin()
    const { data: publicRows, error: pubErr } = await admin
      .from('runtime_packages')
      .select('*')
      .eq('visibility', 'public')
      .order('category')
      .order('name')
    if (pubErr) throw new Error(pubErr.message)

    let orgRows: RuntimePackage[] = []
    if (orgId) {
      const { data, error: orgErr } = await admin
        .from('runtime_packages')
        .select('*')
        .eq('visibility', 'org')
        .eq('org_id', orgId)
      if (orgErr) throw new Error(orgErr.message)
      orgRows = (data ?? []) as RuntimePackage[]
    }

    const byId = new Map<string, RuntimePackage>()
    for (const p of [...(publicRows ?? []), ...orgRows] as RuntimePackage[]) {
      byId.set(p.id, p)
    }
    const packages = [...byId.values()].sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    )

    let installs: RuntimePackageInstall[] = []
    if (orgId) {
      const { data, error: iErr } = await admin
        .from('runtime_package_installs')
        .select('*')
        .eq('org_id', orgId)
      if (iErr) throw new Error(iErr.message)
      installs = (data ?? []) as RuntimePackageInstall[]
    }

    const byPackage = new Map(installs.map((i) => [i.package_id, i]))
    return (packages ?? []).map((p: RuntimePackage) => {
      const inst = byPackage.get(p.id)
      return {
        ...p,
        installed: Boolean(inst),
        installId: inst?.id ?? null,
      }
    })
  }

  async getBySlug(slug: string, orgId?: string): Promise<MarketplacePackageView | null> {
    const { data, error } = await this.admin()
      .from('runtime_packages')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const pkg = data as RuntimePackage
    if (pkg.visibility === 'org' && orgId && pkg.org_id !== orgId) return null

    let installId: string | null = null
    if (orgId) {
      const { data: inst } = await this.admin()
        .from('runtime_package_installs')
        .select('id')
        .eq('org_id', orgId)
        .eq('package_id', pkg.id)
        .maybeSingle()
      installId = (inst as { id?: string } | null)?.id ?? null
    }
    return { ...pkg, installed: Boolean(installId), installId }
  }

  async createPackage(input: {
    orgId: string
    slug: string
    name: string
    description?: string
    category?: string
    connectDefaults?: Record<string, unknown>
    policyTemplates?: unknown[]
    readme?: string
  }): Promise<RuntimePackage> {
    const { data, error } = await this.admin()
      .from('runtime_packages')
      .insert({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? 'general',
        visibility: 'org',
        org_id: input.orgId,
        connect_defaults: input.connectDefaults ?? {},
        policy_templates: input.policyTemplates ?? [],
        readme: input.readme ?? null,
        publisher: input.orgId,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RuntimePackage
  }

  async install(orgId: string, slug: string, config?: Record<string, unknown>) {
    const pkg = await this.getBySlug(slug, orgId)
    if (!pkg) throw new Error('package_not_found')

    const { data, error } = await this.admin()
      .from('runtime_package_installs')
      .upsert(
        {
          org_id: orgId,
          package_id: pkg.id,
          config: config ?? {},
        },
        { onConflict: 'org_id,package_id' },
      )
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return { install: data as RuntimePackageInstall, package: pkg }
  }

  async uninstall(orgId: string, slug: string): Promise<boolean> {
    const pkg = await this.getBySlug(slug, orgId)
    if (!pkg) return false
    const { data, error } = await this.admin()
      .from('runtime_package_installs')
      .delete()
      .eq('org_id', orgId)
      .eq('package_id', pkg.id)
      .select('id')
    if (error) throw new Error(error.message)
    return (data?.length ?? 0) > 0
  }

  async getInstallRecord(orgId: string, slug: string) {
    const pkg = await this.getBySlug(slug, orgId)
    if (!pkg?.installed) return null
    const { data, error } = await this.admin()
      .from('runtime_package_installs')
      .select('id, config, installed_at')
      .eq('org_id', orgId)
      .eq('package_id', pkg.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
      install: data as Pick<RuntimePackageInstall, 'id' | 'config' | 'installed_at'>,
      package: pkg,
    }
  }

  async getInstallConfig(orgId: string, slug: string) {
    const row = await this.getInstallRecord(orgId, slug)
    if (!row) return null
    return this.connectHints(
      row.package,
      (row.install.config as Record<string, unknown>) ?? {},
    )
  }

  connectHints(pkg: RuntimePackage, config: Record<string, unknown> = {}) {
    const defaults = pkg.connect_defaults as Record<string, unknown>
    const merged = { ...defaults, ...config }
    return {
      packageSlug: pkg.slug,
      packageVersion: pkg.version,
      runtimeName:
        (merged.suggestedRuntimeName as string) ??
        `${pkg.slug}-${String(Date.now()).slice(-4)}`,
      organizationId: undefined as string | undefined,
      mode: merged.mode as string | undefined,
      region: merged.region as string | undefined,
      metadata: {
        ...(typeof merged.metadata === 'object' && merged.metadata !== null
          ? (merged.metadata as Record<string, unknown>)
          : {}),
        marketplacePackage: pkg.slug,
        marketplaceVersion: pkg.version,
      },
      agents: (merged.agents as unknown[]) ?? [],
      policyTemplates: pkg.policy_templates,
    }
  }
}
