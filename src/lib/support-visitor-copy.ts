/**
 * Visitor-facing support copy — mirror of apps/api/src/support-visitor-copy.ts
 * Keep both files in sync when changing visitor messaging.
 */

export const HANDOFF_CONFIRMATION_MARKER = "specialist is reviewing";

export const OPERATOR_JOINED_MARKER = "joined the conversation";

export const SUPPORT_VISITOR_COPY = {
  handoffConfirmed:
    "You're with our team now. A specialist is reviewing this conversation and will respond right here — everything you've shared stays in this thread.",

  handoffConnecting: "One moment — bringing in a Sanctum specialist.",

  handoffChip: "Speak with a specialist",
  handoffChipUrgent: "Prioritize this conversation",

  handoffButton: "Speak with the team",
  handoffButtonActive: "Connecting you…",

  handoffCardTitle: {
    low_confidence: "Get a specialist's perspective",
    sales: "Talk with our sales team",
    requested: "Continue with a specialist",
    default: "Speak with the team",
  } as const,

  handoffCardBody: {
    low_confidence:
      "This deserves a closer look. Our team can walk through pilots, architecture, and how Sanctum fits your stack.",
    default:
      "Pilots, procurement, account specifics — a specialist picks up exactly where this conversation left off.",
  } as const,

  errors: {
    connect: "We couldn't open the conversation. Try again in a moment.",
    handoff:
      "We couldn't complete the handoff. Email support@sanctumruntime.com — we'll pick this up immediately.",
    send: "That message didn't go through. Please try again.",
  } as const,

  footer: {
    bot: "Grounded in Sanctum docs · specialists available on request",
    connecting: "Handoff in progress · your messages stay in this thread",
    waiting: "Specialist on the way · keep typing here",
    live: (name: string) => `Live with ${name}`,
    liveGeneric: "Live with Sanctum Support",
  } as const,

  header: {
    guide: "Runtime trust · grounded answers",
    waiting: "Specialist joining shortly",
    live: "Live specialist support",
  } as const,

  placeholder: {
    bot: "Ask about runtime trust, MCP gates, pricing, pilots…",
    waiting: "Share anything else — your specialist will see it",
    live: (name: string) => `Message ${name}…`,
    liveGeneric: "Message your specialist…",
  } as const,

  phase: {
    guide: "Guide",
    handoff: "Handoff",
    live: "Live",
  } as const,
} as const;

export function isHandoffFollowUpChip(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === SUPPORT_VISITOR_COPY.handoffChip.toLowerCase() ||
    t === SUPPORT_VISITOR_COPY.handoffChipUrgent.toLowerCase() ||
    t.includes("speak with a specialist") ||
    t.includes("prioritize this conversation")
  );
}
