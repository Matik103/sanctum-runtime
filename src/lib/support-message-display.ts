/** Client-side transcript normalization — keep in sync with apps/api/src/support-message-display.ts */

import type { SupportChatMessage } from "@/lib/support-chat-api";

const LEGACY_QUEUE_MARKERS = ["in the queue", "sanctum teammate will join"];
const HANDOFF_CONFIRMATION_MARKERS = ["specialist is reviewing", "you're with our team now"];

function isNearDuplicate(a: SupportChatMessage, b: SupportChatMessage): boolean {
  if (a.role !== b.role) return false;
  if (a.content.trim() !== b.content.trim()) return false;
  const senderA = a.sender ?? (a.role === "user" ? "user" : "bot");
  const senderB = b.sender ?? (b.role === "user" ? "user" : "bot");
  if (senderA !== senderB) return false;
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true;
  return Math.abs(tb - ta) < 120_000;
}

export function normalizeSupportMessages(messages: SupportChatMessage[]): SupportChatMessage[] {
  const byId: SupportChatMessage[] = [];
  const seenIds = new Set<string>();
  for (const m of messages) {
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    byId.push(m);
  }

  const hasModernHandoff = byId.some((m) => {
    const c = m.content.toLowerCase();
    return HANDOFF_CONFIRMATION_MARKERS.some((marker) => c.includes(marker));
  });

  const joinedKeys = new Set<string>();
  const filtered = byId.filter((m) => {
    const lower = m.content.toLowerCase();
    if (
      hasModernHandoff &&
      m.sender === "system" &&
      LEGACY_QUEUE_MARKERS.some((marker) => lower.includes(marker))
    ) {
      return false;
    }
    if (m.sender === "system" && lower.includes("joined the conversation")) {
      const key = m.content.trim().toLowerCase();
      if (joinedKeys.has(key)) return false;
      joinedKeys.add(key);
    }
    return true;
  });

  const out: SupportChatMessage[] = [];
  for (const m of filtered) {
    const prev = out[out.length - 1];
    if (prev && isNearDuplicate(prev, m)) continue;
    out.push(m);
  }

  return out;
}

/** Drop optimistic local rows when the server already has the same user line. */
export function mergeWithOptimistic(
  server: SupportChatMessage[],
  local: SupportChatMessage[],
): SupportChatMessage[] {
  const normalized = normalizeSupportMessages(server);
  const pending = local.filter((m) => {
    if (!m.id.startsWith("local-")) return false;
    return !normalized.some(
      (s) => s.role === "user" && s.content.trim() === m.content.trim(),
    );
  });
  return normalizeSupportMessages([...normalized, ...pending]);
}
