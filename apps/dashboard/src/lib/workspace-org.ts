import { fetchMyOrgs, type FleetOrg } from './fleet'
import { fetchOperatorContext } from './marketplace'

/** Billing workspace: API default org, then operator context, then first membership. */
export async function resolveDefaultWorkspaceOrg(): Promise<{
  orgId: string
  orgs: FleetOrg[]
}> {
  const ctx = await fetchOperatorContext()
  let list = await fetchMyOrgs()
  if (list.length === 0 && ctx?.defaultOrganizationId) {
    list = [{ org_id: ctx.defaultOrganizationId, org_name: 'Workspace', role: 'owner' }]
  }

  const defaultId =
    (ctx?.defaultOrganizationId && list.some((o) => o.org_id === ctx.defaultOrganizationId)
      ? ctx.defaultOrganizationId
      : null) ?? list[0]?.org_id ?? ''

  return { orgId: defaultId, orgs: list }
}
