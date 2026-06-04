import { getAccessToken } from "./supabase";
import { fetchMyOrgs, type FleetOrg } from "./fleet";

import { apiBaseUrl as apiBase } from "./api-url";

export type MarketplacePackage = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  publisher: string;
  category: string;
  installed: boolean;
  installId: string | null;
  readme: string | null;
  policy_templates?: unknown[];
  policyTemplates?: unknown[];
};

export type OperatorContext = {
  defaultOrganizationId: string | null;
  organizationIds: string[];
};

async function headers(): Promise<HeadersInit> {
  const token = await getAccessToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function apiError(res: Response, label: string): Promise<never> {
  let detail = `${label} (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string; hint?: string; detail?: string };
    if (body.error) detail = `${label}: ${body.error}`;
    if (body.hint) detail += ` — ${body.hint}`;
    else if (body.detail) detail += ` — ${body.detail}`;
  } catch {
    /* non-JSON body */
  }
  throw new Error(detail);
}

/** Resolve browser-safe operator context through the Sanctum API boundary. */
export async function fetchOperatorContext(): Promise<OperatorContext | null> {
  const res = await fetch(`${apiBase}/v1/operator/context`, { headers: await headers() });
  if (!res.ok) return null;
  return res.json() as Promise<OperatorContext>;
}

export async function fetchMarketplacePackages(orgId?: string): Promise<MarketplacePackage[]> {
  const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  const res = await fetch(`${apiBase}/v1/marketplace/packages${q}`, { headers: await headers() });
  if (!res.ok) await apiError(res, "Marketplace");
  const data = (await res.json()) as { packages: MarketplacePackage[] };
  return data.packages.map((p) => ({
    ...p,
    installed: Boolean(p.installed),
    policyTemplates: p.policy_templates ?? p.policyTemplates ?? [],
  }));
}

export async function installMarketplacePackage(
  slug: string,
  organizationId: string,
): Promise<{ installId: string; installedAt: string; appliedPolicyKeys?: string[] }> {
  const res = await fetch(
    `${apiBase}/v1/marketplace/packages/${encodeURIComponent(slug)}/install`,
    {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({ organizationId }),
    },
  );
  if (!res.ok) await apiError(res, "Install");
  return res.json() as Promise<{
    installId: string;
    installedAt: string;
    appliedPolicyKeys?: string[];
  }>;
}

export async function uninstallMarketplacePackage(
  slug: string,
  organizationId: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase}/v1/marketplace/packages/${encodeURIComponent(slug)}/uninstall`,
    {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({ organizationId }),
    },
  );
  if (!res.ok) await apiError(res, "Uninstall");
}

export { fetchMyOrgs, type FleetOrg };
