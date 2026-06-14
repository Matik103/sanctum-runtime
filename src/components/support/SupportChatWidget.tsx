import * as React from "react";
import {
  ExternalLink,
  Minus,
  Send,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SanctumGuideAvatar, VisitorChatAvatar } from "@/components/support/SupportChatAvatar";
import logo from "@/assets/sanctum-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  createSupportSession,
  fetchSupportMessages,
  getStoredSessionId,
  sendSupportMessage,
  storeSessionId,
  type SupportChatMessage,
  type SupportCitation,
  type SupportHandoff,
} from "@/lib/support-chat-api";
import { consoleUrl, contactUrl, docsPath } from "@/lib/site-links";

const QUICK_PROMPTS = [
  "What is Sanctum Runtime?",
  "How does MCP tool verification work?",
  "Pricing and plans",
  "Talk to sales",
] as const;

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

function HandoffCard({ handoff }: { handoff?: SupportHandoff | null }) {
  if (!handoff?.recommended) return null;
  return (
    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/10 p-3">
      <div className="flex items-start gap-2">
        <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">
            {handoff.reason === "low_confidence" ? "Bring in a human" : handoff.label}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {handoff.reason === "low_confidence"
              ? "The guide did not find enough matching Sanctum knowledge-base context for a confident answer."
              : "A human can help with pilots, account questions, or anything the guide did not resolve."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={handoff.url}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
            >
              {handoff.label}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`mailto:${handoff.email}`}
              className="inline-flex items-center rounded-lg border border-border/80 px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
            >
              {handoff.email}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <SanctumGuideAvatar size="sm" />
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
  );
}

export function SupportChatWidget() {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<SupportChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [booting, setBooting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [connectAttempt, setConnectAttempt] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  React.useEffect(() => {
    if (open) scrollToBottom();
  }, [open, messages, loading, scrollToBottom]);

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
            const history = await fetchSupportMessages(stored);
            if (cancelled) return;
            setSessionId(stored);
            setMessages(history);
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
        if (!cancelled) setError("Could not connect. Try again in a moment.");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, connectAttempt]);

  React.useEffect(() => {
    if (open && !loading) inputRef.current?.focus();
  }, [open, loading]);

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput("");
      setLoading(true);

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
        const reply = await sendSupportMessage(sid, trimmed);
        setMessages((prev) => [...prev, reply]);
      } catch {
        setError("Message failed to send. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(trimmed);
      } finally {
        setLoading(false);
      }
    },
    [loading, sessionId],
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
          <SanctumGuideAvatar size="md" online />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold tracking-tight text-foreground">
              Sanctum Guide
            </p>
            <p className="text-[11px] text-muted-foreground">
              Runtime trust · docs · sales
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

        {/* Messages */}
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {booting && !messages.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Sparkles className="h-6 w-6 animate-pulse text-primary" />
              <p className="text-sm text-muted-foreground">Connecting…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-elevated/50 p-4">
                <p className="font-display text-sm font-medium text-foreground">
                  Ask anything about Sanctum
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Product, MCP verification, pricing, pilots — no account needed. Answers grounded in our docs and blog.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading || booting}
                    onClick={() => void send(prompt)}
                    className="rounded-full border border-border/70 bg-surface/60 px-3 py-1.5 text-left text-[11px] font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
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
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex items-end justify-end gap-2.5">
                    <div className="max-w-[calc(100%-2.5rem)] rounded-2xl rounded-tr-md bg-gradient-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-glow/30">
                      {m.content}
                    </div>
                    <VisitorChatAvatar />
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <SanctumGuideAvatar size="sm" />
                    <div className="min-w-0 max-w-[calc(100%-2.5rem)] rounded-2xl rounded-tl-md border border-border/60 bg-elevated/70 px-3.5 py-2.5">
                      <MessageBody content={m.content} />
                      {m.citations?.length ? <CitationList citations={m.citations} /> : null}
                      <HandoffCard handoff={m.handoff} />
                    </div>
                  </div>
                ),
              )}
              {loading ? <TypingIndicator /> : null}
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
          <div className="flex items-end gap-2 rounded-xl border border-input/80 bg-surface/80 p-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask about runtime trust, MCP, pricing…"
              disabled={loading || booting}
              className="max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
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
            No sign-in required · AI answers from Sanctum docs &amp; blog
          </p>
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
