import "./lib/error-capture";

import { resolveBlogSlug } from "./lib/blog-slug-resolve";
import { crawlStaticResponse, isCrawlStaticPath } from "./lib/crawl-static";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type ContactSalesPayload = {
  organization?: unknown;
  email?: unknown;
  need?: unknown;
  timeline?: unknown;
  details?: unknown;
  path?: unknown;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function reportServerError(label: string, error?: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[site:${label}]`, error);
    return;
  }
  console.error(`[site:${label}] request failed`);
}

function jsonResponse(payload: Record<string, unknown>, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function readServerEnv(env: unknown, key: string): string | undefined {
  const envValue =
    env && typeof env === "object" && key in env ? String((env as Record<string, unknown>)[key] ?? "") : "";
  if (envValue.trim()) return envValue.trim();
  const processValue = process.env[key]?.trim();
  return processValue || undefined;
}

function cleanField(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanMultiline(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function detailsRow(label: string, value: string): string {
  return `<tr><td style="padding:8px 10px;color:#94a3b8;border-bottom:1px solid #1e293b;width:34%;font-size:13px;">${escapeHtml(label)}</td><td style="padding:8px 10px;color:#e2e8f0;border-bottom:1px solid #1e293b;font-size:13px;">${escapeHtml(value || "Not provided")}</td></tr>`;
}

async function handleContactSales(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 20_000) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ error: "json_required" }, { status: 415 });
  }

  let rawPayload: ContactSalesPayload;
  try {
    rawPayload = (await request.json()) as ContactSalesPayload;
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  const organization = cleanField(rawPayload.organization, 160);
  const email = cleanField(rawPayload.email, 200).toLowerCase();
  const need = cleanField(rawPayload.need, 160);
  const timeline = cleanField(rawPayload.timeline, 120);
  const details = cleanMultiline(rawPayload.details, 4000);
  const path = cleanField(rawPayload.path, 300) || "/contact";

  if (organization.length < 2) return jsonResponse({ error: "organization_required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "valid_work_email_required" }, { status: 400 });
  }

  const apiKey = readServerEnv(env, "RESEND_API_KEY");
  if (!apiKey) {
    reportServerError("contact-sales-config", "RESEND_API_KEY missing");
    return jsonResponse({ error: "contact_sales_not_configured" }, { status: 503 });
  }

  const to =
    readServerEnv(env, "CONTACT_SALES_TO_EMAIL") ??
    readServerEnv(env, "VITE_BILLING_EMAIL") ??
    "billing@sanctumruntime.com";
  const from =
    readServerEnv(env, "CONTACT_SALES_FROM_EMAIL") ??
    readServerEnv(env, "NOTIFICATION_FROM_EMAIL") ??
    "Sanctum Sales <support@sanctumruntime.com>";

  const subject = `Enterprise inquiry: ${organization}`;
  const submittedAt = new Date().toISOString();
  const text = [
    "New Sanctum enterprise sales inquiry",
    "",
    `Organization: ${organization}`,
    `Work email: ${email}`,
    `Need: ${need || "Not provided"}`,
    `Timeline: ${timeline || "Not provided"}`,
    `Submitted from: ${path}`,
    `Submitted at: ${submittedAt}`,
    "",
    "What actions should Sanctum control?",
    details || "Not provided",
  ].join("\n");
  const html = `
    <div style="background:#020617;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:28px;">
      <div style="max-width:680px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
        <p style="margin:0 0 8px;color:#60a5fa;text-transform:uppercase;letter-spacing:.08em;font-size:12px;">Sanctum Enterprise Sales</p>
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#f8fafc;">${escapeHtml(organization)} wants to talk</h1>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;border:1px solid #1e293b;border-radius:10px;overflow:hidden;">
          ${detailsRow("Organization", organization)}
          ${detailsRow("Work email", email)}
          ${detailsRow("Need", need)}
          ${detailsRow("Timeline", timeline)}
          ${detailsRow("Submitted from", path)}
          ${detailsRow("Submitted at", submittedAt)}
        </table>
        <h2 style="margin:22px 0 8px;font-size:15px;color:#f8fafc;">What actions should Sanctum control?</h2>
        <p style="white-space:pre-wrap;margin:0;color:#cbd5e1;font-size:14px;line-height:1.6;">${escapeHtml(details || "Not provided")}</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      reportServerError("contact-sales-send", `Resend HTTP ${response.status}`);
      return jsonResponse({ error: "contact_sales_send_failed" }, { status: 502 });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    reportServerError("contact-sales-send", error);
    return jsonResponse({ error: "contact_sales_send_failed" }, { status: 502 });
  }
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  reportServerError("ssr", consumeLastCapturedError());
  return brandedErrorResponse();
}

/** Strip trailing slashes (canonical host uses trailingSlash: false). */
function redirectTrailingSlash(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
    return Response.redirect(url.toString(), 308);
  }
  return null;
}

/** Apex → www (Search Console / canonical host is www.sanctumruntime.com). */
function redirectApexToWww(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== "sanctumruntime.com") return null;
  url.hostname = "www.sanctumruntime.com";
  return Response.redirect(url.toString(), 308);
}

function redirectFavicon(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/favicon.ico") return null;
  url.pathname = "/favicon.png";
  return Response.redirect(url.toString(), 308);
}

/** LinkedIn/social often strip hyphens — redirect to canonical blog slug. */
function redirectBlogSlugAlias(request: Request): Response | null {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/blog\/([^/]+)$/);
  if (!match) return null;
  const resolved = resolveBlogSlug(match[1]);
  if (!resolved || resolved === match[1]) return null;
  url.pathname = `/blog/${resolved}`;
  return Response.redirect(url.toString(), 308);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact-sales") {
      return handleContactSales(request, env);
    }

    // Serve robots/sitemaps on apex + www before apex→www redirect. GSC "robots.txt unreachable"
    // often traces to 308-only robots on the bare domain or SSR catching the path during deploy.
    if (request.method === "GET" || request.method === "HEAD") {
      if (isCrawlStaticPath(url.pathname)) {
        const body = crawlStaticResponse(url.pathname);
        if (request.method === "HEAD") {
          return new Response(null, { status: 200, headers: body.headers });
        }
        return body;
      }
    }

    const faviconRedirect = redirectFavicon(request);
    if (faviconRedirect) return faviconRedirect;

    const blogAliasRedirect = redirectBlogSlugAlias(request);
    if (blogAliasRedirect) return blogAliasRedirect;

    const slashRedirect = redirectTrailingSlash(request);
    if (slashRedirect) return slashRedirect;

    const apexRedirect = redirectApexToWww(request);
    if (apexRedirect) return apexRedirect;

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      reportServerError("fetch", error);
      return brandedErrorResponse();
    }
  },
};
