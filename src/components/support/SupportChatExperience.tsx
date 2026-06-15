import * as React from "react";
import { CheckCircle2, MessageSquarePlus, Sparkles, UserRoundCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORT_VISITOR_COPY } from "@/lib/support-visitor-copy";
import type { SupportHandoff, SupportSessionStatus } from "@/lib/support-chat-api";

export function SupportPhaseRail({
  status,
  escalating,
}: {
  status: SupportSessionStatus;
  escalating: boolean;
}) {
  const resolved = status === "resolved";
  const activeStep = resolved
    ? 4
    : escalating || status === "queued"
      ? 2
      : status === "human_active"
        ? 3
        : 1;
  const steps = [
    { id: 1, label: SUPPORT_VISITOR_COPY.phase.guide },
    { id: 2, label: SUPPORT_VISITOR_COPY.phase.handoff },
    { id: 3, label: SUPPORT_VISITOR_COPY.phase.live },
  ] as const;

  return (
    <div
      className="relative shrink-0 border-b border-border/50 bg-surface/40 px-4 py-2.5"
      aria-label="Conversation phase"
    >
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, index) => {
          const done = resolved || step.id < activeStep;
          const active = !resolved && step.id === activeStep;
          return (
            <React.Fragment key={step.id}>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all duration-500",
                    done && "border-success/50 bg-success/15 text-success",
                    active && "border-primary bg-primary/15 text-primary shadow-glow/20",
                    !done && !active && "border-border/70 bg-elevated/50 text-muted-foreground",
                  )}
                >
                  {done ? "✓" : step.id}
                </div>
                <span
                  className={cn(
                    "truncate text-[9px] font-semibold uppercase tracking-wide transition-colors duration-300",
                    active || (resolved && step.id === 3) ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {resolved && step.id === 3 ? SUPPORT_VISITOR_COPY.phase.done : step.label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "mb-4 h-px flex-1 max-w-[2.5rem] transition-colors duration-500",
                    done ? "bg-success/40" : "bg-border/60",
                  )}
                  aria-hidden
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function SupportIntroPanel({
  prompts,
  onPrompt,
  disabled,
}: {
  prompts: readonly string[];
  onPrompt: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-elevated/80 to-transparent p-4">
        <p className="font-display text-base font-semibold tracking-tight text-foreground">
          {SUPPORT_VISITOR_COPY.welcome.headline}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {SUPPORT_VISITOR_COPY.welcome.subline}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPrompt(prompt)}
            className="rounded-full border border-border/70 bg-surface/60 px-3 py-1.5 text-left text-[11px] font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SupportResumePrompt({
  resolved,
  preview,
  onContinue,
  onNewChat,
}: {
  resolved: boolean;
  preview?: string | null;
  onContinue: () => void;
  onNewChat: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
      <p className="font-display text-sm font-semibold text-foreground">
        {SUPPORT_VISITOR_COPY.resume.headline}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {resolved ? SUPPORT_VISITOR_COPY.resume.bodyResolved : SUPPORT_VISITOR_COPY.resume.bodyActive}
      </p>
      {preview ? (
        <p className="mt-2 line-clamp-2 rounded-lg border border-border/50 bg-surface/50 px-2.5 py-1.5 text-[10px] italic text-muted-foreground">
          “{preview}”
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!resolved ? (
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow/30 transition-opacity hover:opacity-90"
          >
            {SUPPORT_VISITOR_COPY.resume.continue}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
            resolved
              ? "border-primary/40 bg-gradient-primary text-primary-foreground shadow-glow/30 hover:opacity-90"
              : "border-border/70 text-foreground/90 hover:border-primary/40 hover:text-primary",
          )}
        >
          <MessageSquarePlus className="h-3 w-3" />
          {SUPPORT_VISITOR_COPY.resume.newChat}
        </button>
      </div>
    </div>
  );
}

export function SupportSessionEndDivider() {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label="Conversation ended">
      <div className="h-px flex-1 bg-border/70" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-elevated/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
        Resolved
      </span>
      <div className="h-px flex-1 bg-border/70" />
    </div>
  );
}

export function SupportSystemNotice({ content }: { content: string }) {
  return (
    <div className="flex justify-center px-2 py-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex max-w-[94%] items-start gap-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/8 via-primary/5 to-transparent px-3.5 py-2.5 shadow-sm">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="text-center text-[11px] leading-relaxed text-foreground/85">{content}</p>
      </div>
    </div>
  );
}

export function SupportStatusBanner({
  status,
  escalating,
  operatorName,
}: {
  status: SupportSessionStatus;
  escalating: boolean;
  operatorName?: string | null;
}) {
  if (status === "bot" && !escalating) return null;

  const tone =
    status === "resolved"
      ? "border-border/60 bg-elevated/70 text-muted-foreground"
      : status === "human_active"
      ? "border-success/35 bg-success/10 text-success"
      : status === "queued" || escalating
        ? "border-primary/35 bg-primary/10 text-primary"
        : "border-border/60 bg-elevated/60 text-muted-foreground";

  const text = escalating
    ? SUPPORT_VISITOR_COPY.handoffConnecting
    : status === "resolved"
      ? SUPPORT_VISITOR_COPY.footer.resolved
    : status === "human_active"
      ? operatorName
        ? SUPPORT_VISITOR_COPY.footer.live(operatorName)
        : SUPPORT_VISITOR_COPY.footer.liveGeneric
      : status === "queued"
        ? SUPPORT_VISITOR_COPY.footer.waiting
        : null;

  if (!text) return null;

  return (
    <div
      className={cn(
        "relative shrink-0 border-b px-4 py-2.5 text-[11px] font-medium leading-snug transition-all duration-500 animate-in fade-in-0 slide-in-from-top-1",
        tone,
      )}
      role="status"
    >
      <div className="flex items-center gap-2">
        {status === "human_active" ? (
          <UserRoundCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : status === "resolved" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
        ) : (
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
        )}
        <span>{text}</span>
      </div>
    </div>
  );
}

export function PremiumHandoffCard({
  handoff,
  sessionId,
  sessionStatus,
  onEscalate,
  escalating,
}: {
  handoff?: SupportHandoff | null;
  sessionId: string | null;
  sessionStatus: SupportSessionStatus;
  onEscalate: () => void;
  escalating: boolean;
}) {
  if (!handoff?.recommended || sessionStatus !== "bot") return null;

  const title =
    SUPPORT_VISITOR_COPY.handoffCardTitle[
      handoff.reason as keyof typeof SUPPORT_VISITOR_COPY.handoffCardTitle
    ] ?? SUPPORT_VISITOR_COPY.handoffCardTitle.default;

  const body =
    handoff.reason === "low_confidence"
      ? SUPPORT_VISITOR_COPY.handoffCardBody.low_confidence
      : SUPPORT_VISITOR_COPY.handoffCardBody.default;

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/12 to-transparent p-3.5 animate-in fade-in-0 duration-300">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
          <UserRoundCheck className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
          <button
            type="button"
            disabled={!sessionId || escalating}
            onClick={(e) => {
              e.stopPropagation();
              onEscalate();
            }}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow/40 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <UserRoundCheck className="h-3 w-3" />
            {escalating ? SUPPORT_VISITOR_COPY.handoffButtonActive : SUPPORT_VISITOR_COPY.handoffButton}
          </button>
        </div>
      </div>
    </div>
  );
}
