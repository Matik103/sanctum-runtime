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

export type SupportSessionStatus = "bot" | "queued" | "human_active" | "resolved";

export type SupportChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: SupportCitation[];
  handoff?: SupportHandoff | null;
  follow_ups?: string[];
  sender?: "bot" | "operator" | "system";
  operator_display_name?: string | null;
  created_at: string;
  feedback?: -1 | 1 | null;
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

export async function fetchSupportMessages(sessionId: string): Promise<{
  messages: SupportChatMessage[];
  status: SupportSessionStatus;
}> {
  const res = await fetch(`${getBase()}/v1/support/sessions/${encodeURIComponent(sessionId)}/messages`);
  const data = await parseJson<{
    status?: SupportSessionStatus;
    messages: Array<{
      id: string;
      role: SupportChatMessage["role"];
      content: string;
      citations?: SupportCitation[];
      handoff?: SupportHandoff | null;
      follow_ups?: string[];
      sender?: string;
      operator_display_name?: string | null;
      feedback?: -1 | 1 | null;
      created_at: string;
    }>;
  }>(res);
  return {
    status: data.status ?? "bot",
    messages: data.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: m.citations,
      handoff: m.handoff,
      follow_ups: m.follow_ups,
      sender: (m.sender as SupportChatMessage["sender"]) ?? "bot",
      operator_display_name: m.operator_display_name ?? null,
      feedback: m.feedback ?? null,
      created_at: m.created_at,
    })),
  };
}

export async function escalateSupportSession(
  sessionId: string,
  message?: string,
): Promise<{
  status: SupportSessionStatus;
  confirmation?: SupportChatMessage | null;
}> {
  const res = await fetch(`${getBase()}/v1/support/sessions/${encodeURIComponent(sessionId)}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (res.ok) {
    const data = await parseJson<{
      status: SupportSessionStatus;
      confirmation?: { id: string; content: string; created_at: string } | null;
    }>(res);
    return {
      status: data.status,
      confirmation: data.confirmation
        ? {
            id: data.confirmation.id,
            role: "assistant",
            content: data.confirmation.content,
            sender: "system",
            created_at: data.confirmation.created_at,
          }
        : null,
    };
  }

  // Older API builds may not have /escalate yet — trigger handoff through chat instead.
  if (res.status === 404 || res.status === 405) {
    const result = await sendSupportMessage(
      sessionId,
      message?.trim() || "I would like to chat with a human.",
    );
    return {
      status: result.sessionStatus === "queued" ? "queued" : result.sessionStatus,
      confirmation: result.message,
    };
  }

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `request_failed_${res.status}`);
}

export async function submitSupportFeedback(
  messageId: string,
  rating: -1 | 1,
): Promise<void> {
  const res = await fetch(`${getBase()}/v1/support/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `feedback_failed_${res.status}`);
  }
  await res.json().catch(() => undefined);
}

type StreamDonePayload = {
  message?: {
    id: string;
    role: "assistant";
    content: string;
    citation_sources?: SupportCitation[];
    handoff?: SupportHandoff | null;
    follow_ups?: string[];
    created_at: string;
  };
  citations?: SupportCitation[];
  handoff?: SupportHandoff | null;
  follow_ups?: string[];
  session_status?: SupportSessionStatus;
};

export async function sendSupportMessageStream(
  sessionId: string,
  message: string,
  onToken: (text: string) => void,
): Promise<{
  message: SupportChatMessage | null;
  sessionStatus: SupportSessionStatus;
  followUps: string[];
}> {
  const res = await fetch(`${getBase()}/v1/support/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: "chat_failed" })) as { error?: string };
    throw new Error(err.error ?? "chat_failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: StreamDonePayload | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        const data = JSON.parse(dataLine) as Record<string, unknown>;
        if (event === "token" && typeof data.text === "string") onToken(data.text);
        if (event === "done") donePayload = data as StreamDonePayload;
        if (event === "error") throw new Error((data.error as string) ?? "chat_failed");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  const sessionStatus = donePayload?.session_status ?? "bot";
  const followUps = donePayload?.follow_ups ?? donePayload?.message?.follow_ups ?? [];

  if (!donePayload?.message) {
    return { message: null, sessionStatus, followUps };
  }

  const m = donePayload.message;
  return {
    message: {
      id: m.id,
      role: "assistant",
      content: m.content,
      citations: m.citation_sources ?? donePayload.citations,
      handoff: m.handoff ?? donePayload.handoff,
      follow_ups: followUps,
      created_at: m.created_at,
    },
    sessionStatus,
    followUps,
  };
}

/** Non-streaming fallback */
export async function sendSupportMessage(
  sessionId: string,
  message: string,
): Promise<{
  message: SupportChatMessage | null;
  sessionStatus: SupportSessionStatus;
  followUps: string[];
}> {
  const res = await fetch(`${getBase()}/v1/support/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  const data = await parseJson<{
    session_status?: SupportSessionStatus;
    follow_ups?: string[];
    message: {
      id: string;
      role: "assistant";
      content: string;
      citation_sources: SupportCitation[];
      handoff?: SupportHandoff | null;
      follow_ups?: string[];
      created_at: string;
    } | null;
  }>(res);

  if (!data.message) {
    return {
      message: null,
      sessionStatus: data.session_status ?? "bot",
      followUps: data.follow_ups ?? [],
    };
  }

  return {
    message: {
      id: data.message.id,
      role: "assistant",
      content: data.message.content,
      citations: data.message.citation_sources,
      handoff: data.message.handoff,
      follow_ups: data.follow_ups ?? data.message.follow_ups,
      created_at: data.message.created_at,
    },
    sessionStatus: data.session_status ?? "bot",
    followUps: data.follow_ups ?? data.message.follow_ups ?? [],
  };
}
