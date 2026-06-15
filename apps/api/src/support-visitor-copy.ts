/** Visitor-facing support copy — keep in sync with src/lib/support-visitor-copy.ts */

export const HANDOFF_CONFIRMATION_MARKER = 'specialist is reviewing'

export const OPERATOR_JOINED_MARKER = 'joined the conversation'

export const SESSION_RESOLVED_MARKER = 'conversation was marked resolved'

export const SUPPORT_VISITOR_COPY = {
  greeting: `Hi — I'm Sanctum Guide.

I answer from Sanctum docs on runtime trust, MCP gates, pricing, and pilots. Ask anything — or say **Speak with the team** when you want a person in this thread.`,

  generalHelp: `I can walk you through verify-before-execute, MCP hardening, approval flows, audit evidence, and plans from Observer through Enterprise.

What are you building or evaluating?`,

  welcome: {
    headline: 'How can we help?',
    subline:
      'Grounded in Sanctum docs — runtime trust, MCP verification, pricing, and pilots. Specialists join this same thread anytime.',
  },

  resume: {
    headline: 'Welcome back',
    bodyActive: 'Pick up where you left off, or start a fresh conversation.',
    bodyResolved: 'Your last conversation is closed. Start a new one if you need more help.',
    continue: 'Continue conversation',
    newChat: 'Start new chat',
  },

  sessionResolved: (operatorName?: string | null) =>
    operatorName
      ? `${operatorName} marked this conversation resolved. Thanks for chatting with Sanctum — start a new conversation anytime if you need more help.`
      : `This conversation was marked resolved. Thanks for chatting with Sanctum — start a new conversation anytime if you need more help.`,

  sessionReopened:
    'Starting a fresh conversation — your previous messages stay on our side for context if you hand off again.',

  handoffConfirmed: `You're with our team now. A specialist is reviewing this conversation and will respond right here — everything you've shared stays in this thread.`,

  handoffConnecting: 'One moment — bringing in a Sanctum specialist.',

  operatorJoined: (name: string) =>
    `${name} joined the conversation. You're in the same thread — no need to repeat yourself.`,

  handoffChip: 'Speak with a specialist',
  handoffChipUrgent: 'Prioritize this conversation',

  handoffButton: 'Speak with the team',
  handoffButtonActive: 'Connecting you…',

  handoffLabels: {
    sales: 'Schedule with sales',
    requested: 'Speak with the team',
    low_confidence: "Get a specialist's take",
    default: 'Speak with the team',
  } as const,

  appendHandoff: {
    low_confidence:
      'I want you to get the most accurate answer — our specialists can go deeper on architecture, pilots, and fit.',
    default: "If you'd like a person to take this from here, our team can continue in this thread.",
  } as const,

  handoffCardTitle: {
    low_confidence: "Get a specialist's perspective",
    sales: 'Talk with our sales team',
    requested: 'Continue with a specialist',
    default: 'Speak with the team',
  } as const,

  handoffCardBody: {
    low_confidence:
      'This deserves a closer look. Our team can walk through pilots, architecture, and how Sanctum fits your stack.',
    default:
      'Pilots, procurement, account specifics — a specialist picks up exactly where this conversation left off.',
  } as const,

  errors: {
    connect: "We couldn't open the conversation. Try again in a moment.",
    handoff: "We couldn't complete the handoff. Email support@sanctumruntime.com — we'll pick this up immediately.",
    send: "That message didn't go through. Please try again.",
  } as const,

  footer: {
    bot: 'Grounded in Sanctum docs · specialists available on request',
    connecting: 'Handoff in progress · your messages stay in this thread',
    waiting: 'Specialist on the way · keep typing here',
    live: (name: string) => `Live with ${name}`,
    liveGeneric: 'Live with Sanctum Support',
    resolved: 'Conversation closed · start a new chat anytime',
  } as const,

  header: {
    guide: 'Runtime trust · grounded answers',
    waiting: 'Specialist joining shortly',
    live: 'Live specialist support',
    resolved: 'Conversation resolved',
  } as const,

  placeholder: {
    bot: 'Ask about runtime trust, MCP gates, pricing, pilots…',
    waiting: 'Share anything else — your specialist will see it',
    live: (name: string) => `Message ${name}…`,
    liveGeneric: 'Message your specialist…',
    resolved: 'This conversation is closed',
  } as const,

  phase: {
    guide: 'Guide',
    handoff: 'Handoff',
    live: 'Live',
    done: 'Done',
  } as const,
} as const

export function handoffLabelForReason(reason: string | undefined): string {
  if (reason === 'sales') return SUPPORT_VISITOR_COPY.handoffLabels.sales
  if (reason === 'low_confidence') return SUPPORT_VISITOR_COPY.handoffLabels.low_confidence
  if (reason === 'requested') return SUPPORT_VISITOR_COPY.handoffLabels.requested
  return SUPPORT_VISITOR_COPY.handoffLabels.default
}
