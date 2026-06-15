import * as React from "react";
import {
  ExternalLink,
  Minus,
  MessageSquarePlus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRoundCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SanctumGuideAvatar, OperatorChatAvatar, VisitorChatAvatar } from "@/components/support/SupportChatAvatar";
import {
  PremiumHandoffCard,
  SupportIntroPanel,
  SupportPhaseRail,
  SupportResumePrompt,
  SupportSessionEndDivider,
  SupportStatusBanner,
  SupportSystemNotice,
} from "@/components/support/SupportChatExperience";
import { isHandoffFollowUpChip, SESSION_RESOLVED_MARKER, SUPPORT_VISITOR_COPY } from "@/lib/support-visitor-copy";
import { mergeWithOptimistic, normalizeSupportMessages } from "@/lib/support-message-display";
import logo from "@/assets/sanctum-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  clearStoredSessionId,
  createSupportSession,
  escalateSupportSession,
  fetchSupportMessages,
  getStoredSessionId,
  sendSupportMessage,
  sendSupportMessageStream,
  storeSessionId,
  submitSupportFeedback,
  type SupportChatMessage,
  type SupportCitation,
  type SupportHandoff,
  type SupportSessionStatus,
} from "@/lib/support-chat-api";
import { consoleUrl, contactUrl, docsPath } from "@/lib/site-links";

const QUICK_PROMPTS = [
  "What is Sanctum Runtime?",
  "How does MCP tool verification work?",
  "Pricing and plans",
  "Speak with the team",
] as const;

const RESUME_DISMISSED_PREFIX = "sanctum_support_resumed_";

function hasResumeDismissed(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(`${RESUME_DISMISSED_PREFIX}${sessionId}`) === "1";
  } catch {
    return false;
  }
}

function markResumeDismissed(sessionId: string): void {
  try {
    sessionStorage.setItem(`${RESUME_DISMISSED_PREFIX}${sessionId}`, "1");
  } catch {
    /* private browsing */
  }
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[1] && match[2]) {
      parts.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[3]}
        </strong>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function MessageBody({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/);
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-foreground/95">
      {paragraphs.map((p, i) => (
        <p key={i}>{renderInlineMarkdown(p.replace(/\n/g, " "))}</p>
      ))}
    </div>
  );
}

function CitationList({ citations }: { citations: SupportCitation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {citations.slice(0, 4).map((c) =>
        c.url ? (
          <a
            key={c.chunk_id}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-background/40 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{c.title}</span>
          </a>
        ) : (
          <span
            key={c.chunk_id}
            className="inline-flex max-w-full items-center rounded-full border border-border/80 bg-background/40 px-2.5 py-0.5 text-[10px] text-muted-foreground"
          >
            <span className="truncate">{c.title}</span>
          </span>
        ),
      )}
    </div>
  );
}

function FeedbackRow({
  messageId,
  rating,
  onRate,
}: {
  messageId: string;
  rating?: -1 | 1 | null;
  onRate: (id: string, r: -1 | 1) => Promise<void>;
}) {
  const [localRating, setLocalRating] = React.useState<-1 | 1 | null>(rating ?? null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (rating != null) setLocalRating(rating);
  }, [rating]);

  if (messageId.startsWith("local-") || messageId.startsWith("stream-")) return null;

  const submit = (value: -1 | 1) => {
    void (async () => {
      setFailed(false);
      setLocalRating(value);
      try {
        await onRate(messageId, value);
      } catch {
        setLocalRating(null);
        setFailed(true);
      }
    })();
  };

  return (
    <div className="mt-2 flex items-center gap-1.5 border-t border-border/40 pt-2">
      {localRating != null ? (
        <span className="text-[10px] text-muted-foreground">Thanks for the feedback.</span>
      ) : (
        <>
          <span className="text-[10px] text-muted-foreground">Helpful?</span>
          <button
            type="button"
            aria-label="Thumbs up"
            onClick={(e) => {
              e.stopPropagation();
              submit(1);
            }}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-primary"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Thumbs down"
            onClick={(e) => {
              e.stopPropagation();
              submit(-1);
            }}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
          {failed ? (
            <span className="text-[10px] text-destructive">Could not save — try again</span>
          ) : null}
        </>
      )}
    </div>
  );
}

function FollowUpChips({
  suggestions,
  disabled,
  onSelect,
}: {
  suggestions: string[];
  disabled: boolean;
  onSelect: (text: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(s)}
          className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-[10px] font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function TypingIndicator({ label = "Sanctum Guide" }: { label?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <SanctumGuideAvatar size="sm" />
      <div className="min-w-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="rounded-2xl rounded-tl-md border border-border/60 bg-elevated/80 px-4 py-3">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SupportChatWidget() {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = React.useState<SupportSessionStatus>("bot");
  const [messages, setMessages] = React.useState<SupportChatMessage[]>([]);
  const [followUps, setFollowUps] = React.useState<string[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [streamingText, setStreamingText] = React.useState("");
  const [booting, setBooting] = React.useState(false);
  const [escalating, setEscalating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [connectAttempt, setConnectAttempt] = React.useState(0);
  const [showResumePrompt, setShowResumePrompt] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const activeOperatorName = React.useMemo(() => {
    const operatorMsg = [...messages].reverse().find((m) => m.sender === "operator");
    return operatorMsg?.operator_display_name ?? null;
  }, [messages]);

  const lastMessagePreview = React.useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "user" || m.sender === "operator");
    return last?.content?.slice(0, 140) ?? null;
  }, [messages]);

  const hasResolvedNotice = React.useMemo(
    () =>
      messages.some(
        (m) =>
          m.sender === "system" &&
          m.content.toLowerCase().includes(SESSION_RESOLVED_MARKER),
      ),
    [messages],
  );

  const handleStartFresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      clearStoredSessionId();
      const id = await createSupportSession();
      setSessionId(id);
      setMessages([]);
      setSessionStatus("bot");
      setFollowUps([]);
      setInput("");
      setShowResumePrompt(false);
      markResumeDismissed(id);
    } catch {
      setError(SUPPORT_VISITOR_COPY.errors.connect);
    } finally {
      setLoading(false);
    }
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleContinueConversation = React.useCallback(() => {
    if (sessionId) markResumeDismissed(sessionId);
    setShowResumePrompt(false);
    scrollToBottom();
  }, [sessionId, scrollToBottom]);

  React.useEffect(() => {
    if (open) scrollToBottom();
  }, [open, messages, loading, streamingText, sessionStatus, scrollToBottom]);

  const refreshMessages = React.useCallback(async (sid: string) => {
    const data = await fetchSupportMessages(sid);
    setMessages((prev) => mergeWithOptimistic(normalizeSupportMessages(data.messages), prev));
    setSessionStatus(data.status);
    return data;
  }, []);

  React.useEffect(() => {
    if (!open || sessionId) return;
    let cancelled = false;
    setBooting(true);
    setError(null);
    void (async () => {
      try {
        const stored = getStoredSessionId();
        if (stored) {
          try {
            const data = await refreshMessages(stored);
            if (cancelled) return;
            setSessionId(stored);
            setMessages(normalizeSupportMessages(data.messages));
            setSessionStatus(data.status);
            setShowResumePrompt(
              data.messages.length > 0 &&
                data.status !== "resolved" &&
                !hasResumeDismissed(stored),
            );
            return;
          } catch {
            try {
              localStorage.removeItem("sanctum_support_session_id");
            } catch {
              /* ignore */
            }
          }
        }

        const id = await createSupportSession();
        if (cancelled) return;
        setSessionId(id);
        setMessages([]);
      } catch {
        if (!cancelled) setError(SUPPORT_VISITOR_COPY.errors.connect);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, connectAttempt, refreshMessages]);

  React.useEffect(() => {
    if (!open || !sessionId) return;
    if (
      sessionStatus !== "human_active" &&
      sessionStatus !== "queued" &&
      sessionStatus !== "resolved"
    ) {
      return;
    }

    const poll = () => {
      void refreshMessages(sessionId).catch(() => {});
    };
    poll();
    const intervalMs =
      sessionStatus === "queued" ? 2000 : sessionStatus === "human_active" ? 2500 : 5000;
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [open, sessionId, sessionStatus, refreshMessages]);

  React.useEffect(() => {
    if (open && !loading) inputRef.current?.focus();
  }, [open, loading]);

  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [input, open, sessionStatus]);

  const handleEscalate = React.useCallback(async () => {
    if (!sessionId || escalating) return;
    setEscalating(true);
    setError(null);
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const { status, confirmation } = await escalateSupportSession(
        sessionId,
        lastUser?.content,
      );
      setSessionStatus(status);
      if (confirmation) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === confirmation.id)) return prev;
          return [...prev, confirmation];
        });
      } else {
        await refreshMessages(sessionId);
      }
    } catch {
      setError(SUPPORT_VISITOR_COPY.errors.handoff);
    } finally {
      setEscalating(false);
    }
  }, [sessionId, escalating, messages, refreshMessages]);

  const handleFeedback = React.useCallback(async (messageId: string, rating: -1 | 1) => {
    const previous = messages.find((m) => m.id === messageId)?.feedback ?? null;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m)),
    );
    try {
      await submitSupportFeedback(messageId, rating);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: previous } : m)),
      );
      throw new Error("feedback_failed");
    }
  }, [messages]);

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput("");
      setFollowUps([]);
      setLoading(true);
      setStreamingText("");

      const optimistic: SupportChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        let sid = sessionId;
        if (!sid) {
          sid = await createSupportSession();
          setSessionId(sid);
        }

        let assembled = "";

        try {
          const result = await sendSupportMessageStream(sid, trimmed, (token) => {
            assembled += token;
            setStreamingText(assembled);
          });

          setStreamingText("");
          setSessionStatus(result.sessionStatus);
          setFollowUps(result.followUps);

          if (result.message) {
            setMessages((prev) =>
              mergeWithOptimistic(normalizeSupportMessages([...prev, result.message!]), prev),
            );
          } else if (result.sessionStatus === "human_active" || result.sessionStatus === "queued") {
            await refreshMessages(sid);
          }
        } catch {
          try {
            const snapshot = await fetchSupportMessages(sid);
            const persisted = snapshot.messages.some(
              (m) => m.role === "user" && m.content.trim() === trimmed,
            );
            if (
              persisted ||
              snapshot.status === "human_active" ||
              snapshot.status === "queued"
            ) {
              setSessionStatus(snapshot.status);
              setMessages((prev) =>
                mergeWithOptimistic(normalizeSupportMessages(snapshot.messages), prev),
              );
              return;
            }
          } catch {
            /* fall through to non-stream send */
          }

          const result = await sendSupportMessage(sid, trimmed);
          setSessionStatus(result.sessionStatus);
          setFollowUps(result.followUps);
          if (result.message) {
            setMessages((prev) =>
              mergeWithOptimistic(normalizeSupportMessages([...prev, result.message!]), prev),
            );
          } else if (result.sessionStatus === "human_active" || result.sessionStatus === "queued") {
            await refreshMessages(sid);
          }
        }
      } catch {
        setError(SUPPORT_VISITOR_COPY.errors.send);
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setStreamingText("");
        setInput(trimmed);
      } finally {
        setLoading(false);
      }
    },
    [loading, sessionId, refreshMessages],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end p-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:p-0"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      {/* Chat panel */}
      <div
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden border border-border/70 bg-gradient-surface shadow-elevated backdrop-blur-xl transition-all duration-300 ease-out",
          isMobile
            ? "fixed inset-x-0 bottom-0 max-h-[min(92dvh,720px)] w-full rounded-t-[1.25rem]"
            : "mb-0 w-[min(100vw-2rem,400px)] rounded-2xl",
          open
            ? cn(
                "opacity-100",
                isMobile ? "translate-y-0" : "mb-4 h-[min(640px,calc(100dvh-6rem))] scale-100",
              )
            : cn(
                "pointer-events-none opacity-0",
                isMobile ? "translate-y-full" : "mb-0 h-0 scale-95",
              ),
        )}
        aria-hidden={!open}
      >
        {/* Glow accent */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-64 -translate-x-1/2 bg-gradient-primary opacity-20 blur-[80px]" />

        {/* Header */}
        <header className="relative flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3.5">
          {sessionStatus === "human_active" ? (
            <OperatorChatAvatar size="md" />
          ) : (
            <SanctumGuideAvatar size="md" online={sessionStatus === "bot"} />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold tracking-tight text-foreground">
              {sessionStatus === "human_active"
                ? activeOperatorName ?? "Sanctum Support"
                : sessionStatus === "resolved"
                  ? "Sanctum Support"
                  : "Sanctum Guide"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {sessionStatus === "resolved"
                ? SUPPORT_VISITOR_COPY.header.resolved
                : sessionStatus === "human_active"
                  ? SUPPORT_VISITOR_COPY.header.live
                  : sessionStatus === "queued" || escalating
                    ? SUPPORT_VISITOR_COPY.header.waiting
                    : SUPPORT_VISITOR_COPY.header.guide}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Minimize chat"
          >
            <Minus className="h-4 w-4" />
          </button>
          {isMobile && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        <SupportPhaseRail status={sessionStatus} escalating={escalating} />

        <SupportStatusBanner
          status={sessionStatus}
          escalating={escalating}
          operatorName={activeOperatorName}
        />

        {/* Messages */}
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {booting && !messages.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Sparkles className="h-6 w-6 animate-pulse text-primary" />
              <p className="text-sm text-muted-foreground">Opening your conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <SupportIntroPanel
                prompts={QUICK_PROMPTS}
                disabled={loading || booting}
                onPrompt={(prompt) =>
                  prompt === "Speak with the team" ? void handleEscalate() : void send(prompt)
                }
              />
              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <a href={docsPath} className="underline-offset-2 hover:text-primary hover:underline">
                  Docs
                </a>
                <span>·</span>
                <a href={consoleUrl} className="underline-offset-2 hover:text-primary hover:underline">
                  Console
                </a>
                <span>·</span>
                <a href={contactUrl} className="underline-offset-2 hover:text-primary hover:underline">
                  Contact
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {showResumePrompt ? (
                <SupportResumePrompt
                  resolved={sessionStatus === "resolved"}
                  preview={lastMessagePreview}
                  onContinue={handleContinueConversation}
                  onNewChat={() => void handleStartFresh()}
                />
              ) : null}
              {messages.map((m) => {
                if (m.sender === "system") {
                  const isResolvedNotice = m.content.toLowerCase().includes(SESSION_RESOLVED_MARKER);
                  return (
                    <React.Fragment key={m.id}>
                      {isResolvedNotice ? <SupportSessionEndDivider /> : null}
                      <SupportSystemNotice content={m.content} />
                    </React.Fragment>
                  );
                }

                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex items-end justify-end gap-2.5">
                      <div className="max-w-[calc(100%-2.5rem)] rounded-2xl rounded-tr-md bg-gradient-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-glow/30">
                        {m.content}
                      </div>
                      <VisitorChatAvatar />
                    </div>
                  );
                }

                const isOperator = m.sender === "operator";

                return (
                  <div key={m.id} className="flex items-start gap-2.5">
                    {isOperator ? <OperatorChatAvatar size="sm" /> : <SanctumGuideAvatar size="sm" />}
                    <div className="min-w-0 max-w-[calc(100%-2.5rem)] rounded-2xl rounded-tl-md border border-border/60 bg-elevated/70 px-3.5 py-2.5">
                      {isOperator ? (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-success">
                          {m.operator_display_name ?? "Sanctum Support"}
                        </p>
                      ) : null}
                      <MessageBody content={m.content} />
                      {m.citations?.length ? <CitationList citations={m.citations} /> : null}
                      <PremiumHandoffCard
                        handoff={m.handoff}
                        sessionId={sessionId}
                        sessionStatus={sessionStatus}
                        onEscalate={() => void handleEscalate()}
                        escalating={escalating}
                      />
                      {m.role === "assistant" && m.sender !== "system" && !isOperator ? (
                        <FeedbackRow messageId={m.id} rating={m.feedback} onRate={handleFeedback} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {loading && streamingText ? (
                <div className="flex items-start gap-2.5">
                  <SanctumGuideAvatar size="sm" />
                  <div className="min-w-0 max-w-[calc(100%-2.5rem)] rounded-2xl rounded-tl-md border border-border/60 bg-elevated/70 px-3.5 py-2.5">
                    <MessageBody content={streamingText} />
                  </div>
                </div>
              ) : null}
              {loading && !streamingText ? <TypingIndicator /> : null}
              {!loading && followUps.length && sessionStatus === "bot" ? (
                <FollowUpChips
                  suggestions={followUps}
                  disabled={loading || booting}
                  onSelect={(s) => {
                    if (isHandoffFollowUpChip(s) || s === "Speak with the team") {
                      void handleEscalate();
                    } else {
                      void send(s);
                    }
                  }}
                />
              ) : null}
              {sessionStatus === "resolved" && !hasResolvedNotice ? <SupportSessionEndDivider /> : null}
            </div>
          )}
          {error ? (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setSessionId(null);
                  setError(null);
                  setConnectAttempt((n) => n + 1);
                }}
                className="mt-2 font-medium underline-offset-2 hover:underline"
              >
                Retry connection
              </button>
            </div>
          ) : null}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {sessionStatus === "resolved" ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleStartFresh()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow/40 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <MessageSquarePlus className="h-4 w-4" />
                {SUPPORT_VISITOR_COPY.resume.newChat}
              </button>
              <p className="text-center text-[10px] text-muted-foreground/80">
                {SUPPORT_VISITOR_COPY.footer.resolved}
              </p>
            </div>
          ) : (
            <>
              {sessionStatus === "bot" && sessionId ? (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    disabled={escalating}
                    onClick={() => void handleEscalate()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
                  >
                    <UserRoundCheck className="h-3 w-3" />
                    {escalating ? SUPPORT_VISITOR_COPY.handoffButtonActive : SUPPORT_VISITOR_COPY.handoffButton}
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-2 rounded-xl border border-input/80 bg-surface/80 p-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={
                    sessionStatus === "human_active"
                      ? activeOperatorName
                        ? SUPPORT_VISITOR_COPY.placeholder.live(activeOperatorName)
                        : SUPPORT_VISITOR_COPY.placeholder.liveGeneric
                      : sessionStatus === "queued"
                        ? SUPPORT_VISITOR_COPY.placeholder.waiting
                        : SUPPORT_VISITOR_COPY.placeholder.bot
                  }
                  disabled={loading || booting}
                  className="max-h-28 min-h-[2.5rem] flex-1 resize-none overflow-hidden bg-transparent px-2 py-1.5 text-sm leading-normal text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                  aria-label="Message"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={!input.trim() || loading || booting}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground/80">
                {sessionStatus === "bot"
                  ? escalating
                    ? SUPPORT_VISITOR_COPY.footer.connecting
                    : SUPPORT_VISITOR_COPY.footer.bot
                  : null}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Launcher bubble — hidden on mobile when panel is open (header has close) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto relative flex items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-surface shadow-glow transition-all duration-300 hover:scale-105 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isMobile ? "m-4 h-14 w-14" : "h-14 w-14",
          open && (isMobile ? "hidden" : "scale-0 opacity-0"),
        )}
        aria-expanded={open}
        aria-label={open ? "Close support chat" : "Open support chat"}
      >
        {!open && (
          <span
            className="absolute inset-0 animate-ping rounded-full bg-primary/30"
            style={{ animationDuration: "2.5s" }}
          />
        )}
        <img src={logo} alt="" className="relative h-8 w-8 object-contain" aria-hidden />
      </button>
    </div>
  );
}
