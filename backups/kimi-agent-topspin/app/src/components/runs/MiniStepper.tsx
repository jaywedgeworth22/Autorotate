import { memo, useEffect, useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PIPELINE_STEPS } from "@/components/primitives";
import type { StepState } from "@/components/primitives";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* MiniStepper — 16px inline nodes for table rows                       */
/* ------------------------------------------------------------------ */

const MINI_STATE: Record<StepState, string> = {
  pending: "border-line-strong text-ink-muted",
  running: "border-info text-info animate-tick-pulse",
  ok: "border-spin bg-spin/10 text-spin",
  warn: "border-warn text-warn",
  failed: "border-danger text-danger",
};

export const MiniStepper = memo(function MiniStepper({
  steps,
  className,
}: {
  steps: StepState[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      {PIPELINE_STEPS.map((step, i) => {
        const state: StepState = steps[i] ?? "pending";
        const Icon: LucideIcon = step.icon;
        return (
          <div key={step.key} className="flex items-center" title={`${step.label} · ${state}`}>
            {i > 0 && (
              <div className="relative h-px w-3 bg-line-subtle">
                <div
                  className="absolute inset-y-0 left-0 bg-spin transition-all duration-300"
                  style={{ width: state !== "pending" ? "100%" : "0%" }}
                />
              </div>
            )}
            <div
              className={cn(
                "flex size-4 items-center justify-center rounded-full border bg-panel",
                MINI_STATE[state],
              )}
            >
              {state === "ok" ? (
                <Check className="size-2" />
              ) : state === "failed" ? (
                <X className="size-2" />
              ) : state === "warn" ? (
                <AlertTriangle className="size-2" />
              ) : (
                <Icon className="size-2" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* ElapsedTicker — tabular-nums 100ms counter for live runs             */
/* ------------------------------------------------------------------ */

export const ElapsedTicker = memo(function ElapsedTicker({
  since,
  className,
}: {
  since: Date | string | number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - new Date(since).getTime());
  const seconds = (elapsed / 1000).toFixed(1);
  return (
    <span className={cn("tnum font-mono text-[13px] leading-5 text-info", className)}>
      {seconds}s
    </span>
  );
});
