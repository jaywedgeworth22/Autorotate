import { Check, Lock, RefreshCw, Share2, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { RUN_STEP_NAMES, type RotationStep, type RunStepName, type StepStatus } from "@/lib/audit";

const LABELS: Record<RunStepName, string> = {
  lock: "Lock",
  rotate: "Rotate",
  push: "Push",
  verify: "Verify",
  commit: "Commit",
  audit: "Audit",
};

const ICONS = {
  lock: Lock,
  rotate: RefreshCw,
  push: Share2,
  verify: ShieldQuestion,
  commit: Check,
  audit: ShieldCheck,
} as const;

function stateOf(steps: RotationStep[], name: RunStepName): StepStatus | "pending" {
  const found = [...steps].reverse().find((s) => s.step === name);
  return found?.status ?? "pending";
}

export function PipelineStepper({
  steps,
  className,
}: {
  steps: RotationStep[];
  className?: string;
}) {
  return (
    <ol className={cn("grid grid-cols-3 gap-2 sm:grid-cols-6", className)}>
      {RUN_STEP_NAMES.map((name) => {
        const state = stateOf(steps, name);
        const Icon = ICONS[name];
        return (
          <li
            key={name}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-md px-1 py-2 text-center",
              state === "ok" && "bg-card-elevated",
              state === "failed" && "bg-card-elevated",
              state === "running" && "bg-card",
            )}
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full shadow-[var(--shadow-border)]",
                state === "ok" && "text-sage",
                state === "failed" && "text-danger",
                state === "running" && "text-steel",
                state === "skipped" && "text-subtle",
                state === "pending" && "text-subtle",
              )}
            >
              {state === "failed" ? <X className="size-3.5" /> : <Icon className="size-3.5" />}
            </span>
            <span className="text-[10px] font-medium tracking-wide text-muted uppercase">
              {LABELS[name]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PipelineLog({ steps }: { steps: RotationStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-1 font-mono text-xs text-muted">
      {steps.map((s, i) => (
        <li key={`${s.step}-${s.startedAt}-${i}`}>
          <span className={s.status === "failed" ? "text-danger" : s.status === "ok" ? "text-sage" : ""}>
            {s.step.toUpperCase()}
          </span>
          {" — "}
          {s.message}
          <span className="text-subtle"> · {s.durationMs}ms</span>
        </li>
      ))}
    </ol>
  );
}
