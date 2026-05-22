import type { SanctumClient } from "./client.js";
import type { ConnectOptions, RuntimeMode } from "./control-plane.js";
import type { RegisterAgentOptions } from "./control-plane.js";

export type MarketplacePackage = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  publisher: string;
  category: string;
  installed: boolean;
  connect_defaults?: Record<string, unknown>;
};

export type MarketplaceConnectHints = {
  packageSlug: string;
  packageVersion: string;
  runtimeName: string;
  organizationId?: string;
  mode?: string;
  region?: string;
  metadata?: Record<string, unknown>;
  agents?: RegisterAgentOptions[];
  policyTemplates?: unknown[];
};

export class MarketplaceClient {
  constructor(private client: SanctumClient) {}

  listPackages(orgId?: string) {
    const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
    return this.client.request<{ packages: MarketplacePackage[] }>(
      "GET",
      `/v1/marketplace/packages${q}`,
    );
  }

  getPackage(slug: string, orgId?: string) {
    const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
    return this.client.request<{ package: MarketplacePackage }>(
      "GET",
      `/v1/marketplace/packages/${encodeURIComponent(slug)}${q}`,
    );
  }

  async install(slug: string, organizationId: string, config?: Record<string, unknown>) {
    return this.client.request<{
      installId: string;
      installedAt: string;
      connect: MarketplaceConnectHints;
    }>("POST", `/v1/marketplace/packages/${encodeURIComponent(slug)}/install`, {
      organizationId,
      config,
    });
  }

  async getConnectHints(slug: string, organizationId: string) {
    return this.client.request<{ connect: MarketplaceConnectHints }>(
      "GET",
      `/v1/marketplace/packages/${encodeURIComponent(slug)}/connect?org_id=${encodeURIComponent(organizationId)}`,
    );
  }

  uninstall(slug: string, organizationId: string) {
    return this.client.request<{ ok: boolean }>(
      "POST",
      `/v1/marketplace/packages/${encodeURIComponent(slug)}/uninstall`,
      { organizationId },
    );
  }

  /** Map marketplace connect hints → SDK connect options. */
  toConnectOptions(hints: MarketplaceConnectHints, organizationId: string): ConnectOptions {
    return {
      runtimeName: hints.runtimeName,
      organizationId,
      mode: (hints.mode as RuntimeMode) ?? "cloud",
      region: hints.region,
      metadata: hints.metadata,
    };
  }
}
