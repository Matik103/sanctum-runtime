import { apiUrl } from "@/lib/site-links";

/** Anonymous visitor chat — no Supabase login or API key; session id only. */

export type SupportCitation = {
  slug: string;
  title: string;
  url: string | null;
  chunk_id: string;
};

export type SupportHandoff = {
  recommended: boolean;
  reason: "requested" | "low_confidence" | "sales" | "fallback";
  label: string;
  url: string;
  email: string;
};

export type SupportChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: SupportCitation[];
  handoff?: SupportHandoff | null;
  created_at: string;
};

const SESSION_KEY = "sanctum_support_session_id";

function getBase(): string {
  return apiUrl.replace(/\/$/, "");
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `request_failed_${res.status}`);
  }
  return body;
}

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function storeSessionId(id: string): void {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* private browsing */
  }
}

export async function createSupportSession(meta?: {
  landing_path?: string;
  referrer?: string;
}): Promise<string> {
  const res = await fetch(`${getBase()}/v1/support/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      landing_path: meta?.landing_path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      referrer: meta?.referrer ?? (typeof document !== "undefined" ? document.referrer : undefined),
      locale: typeof navigator !== "undefined" ? navigator.language : "en",
    }),
  });
  const data = await parseJson<{ session_id: string }>(res);
  storeSessionId(data.session_id);
  return data.session_id;
}

export async function ensureSupportSession(): Promise<string> {
  const existing = getStoredSessionId();
  if (existing) return existing;
  return createSupportSession();
}

export async function fetchSupportMessages(sessionId: string): Promise<SupportChatMessage[]> {
  const res = await fetch(`${getBase()}/v1/support/sessions/${encodeURIComponent(sessionId)}/messages`);
  const data = await parseJson<{
    messages: Array<{
      id: string;
      role: SupportChatMessage["role"];
      content: string;
      citations?: SupportCitation[];
      handoff?: SupportHandoff | null;
      created_at: string;
    }>;
  }>(res);
  return data.messages;
}

export async function sendSupportMessage(
  sessionId: string,
  message: string,
): Promise<SupportChatMessage> {
  const res = await fetch(`${getBase()}/v1/support/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  const data = await parseJson<{
    message: {
      id: string;
      role: "assistant";
      content: string;
      citation_sources: SupportCitation[];
      handoff?: SupportHandoff | null;
      created_at: string;
    };
  }>(res);
  return {
    id: data.message.id,
    role: "assistant",
    content: data.message.content,
    citations: data.message.citation_sources,
    handoff: data.message.handoff,
    created_at: data.message.created_at,
  };
}
