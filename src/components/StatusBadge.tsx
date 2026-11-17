import type { ReactNode } from "react";

export type Tone = "wait" | "ok" | "error";

const TONES: Record<Tone, string> = {
  wait: "bg-mist/15 text-mist",
  ok: "bg-emerald-400/15 text-emerald-300",
  error: "bg-red-400/15 text-red-300",
};

export function StatusBadge({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid={testId}
      data-tone={tone}
      className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-base font-semibold ${TONES[tone]}`}
    >
      <span className={`size-2.5 rounded-full bg-current ${tone === "wait" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {children}
    </p>
  );
}
