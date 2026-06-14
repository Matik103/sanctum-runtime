import logo from "@/assets/sanctum-logo.png";
import { cn } from "@/lib/utils";

const guideSizes = {
  sm: { box: "h-8 w-8 rounded-full", img: "h-5 w-5" },
  md: { box: "h-10 w-10 rounded-xl", img: "h-6 w-6" },
  lg: { box: "h-14 w-14 rounded-full", img: "h-8 w-8" },
} as const;

/** Sanctum Guide — brand logo used in chat header and assistant messages. */
export function SanctumGuideAvatar({
  size = "md",
  online = false,
  className,
}: {
  size?: keyof typeof guideSizes;
  online?: boolean;
  className?: string;
}) {
  const s = guideSizes[size];
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center border border-primary/25 bg-surface shadow-glow",
        s.box,
        className,
      )}
    >
      <img src={logo} alt="" className={cn(s.img, "object-contain")} aria-hidden />
      {online ? (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-elevated bg-success" />
      ) : null}
    </div>
  );
}

/** Visitor message avatar — Sanctum logo mark (anonymous; no account). */
export function VisitorChatAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10",
        className,
      )}
    >
      <img src={logo} alt="" className="h-5 w-5 object-contain" aria-hidden />
    </div>
  );
}
