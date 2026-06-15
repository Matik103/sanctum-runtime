import * as React from "react";
import { Sparkles, UserRoundCheck } from "lucide-react";
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
  const activeStep = escalating || status === "queued" ? 2 : status === "human_active" ? 3 : 1;
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
          const done = step.id < activeStep;
          const active = step.id === activeStep;
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
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "mb-4 h-px flex-1 max-w-[2.5rem] transition-colors duration-500",
                    step.id < activeStep ? "bg-success/40" : "bg-border/60",
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
    status === "human_active"
      ? "border-success/35 bg-success/10 text-success"
      : status === "queued" || escalating
        ? "border-primary/35 bg-primary/10 text-primary"
        : "border-border/60 bg-elevated/60 text-muted-foreground";

  const text = escalating
    ? SUPPORT_VISITOR_COPY.handoffConnecting
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
