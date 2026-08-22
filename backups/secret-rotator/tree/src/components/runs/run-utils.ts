import type { RotationRun, RotationStep } from "@contracts/topspin";
import { RUN_STEP_NAMES } from "@contracts/topspin";
import type { StepState } from "@/components/primitives";

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                      */
/* ------------------------------------------------------------------ */

export function parseSteps(json: unknown): RotationStep[] {
  if (Array.isArray(json)) return json as RotationStep[];
  if (typeof json === "string") {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? (parsed as RotationStep[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Collapse the (possibly many) stored step entries into 6 node states. */
export function runStepStates(run: RotationRun): StepState[] {
  const steps = parseSteps(run.stepsJson);
  return RUN_STEP_NAMES.map((name) => {
    const matching = steps.filter((s) => s.step === name);
    if (matching.length === 0) return "pending";
    const anyRunning = matching.some((s) => s.status === "running");
    const anyFailed = matching.some((s) => s.status === "failed");
    const anyOk = matching.some((s) => s.status === "ok");
    if (anyRunning) return "running";
    if (anyFailed && anyOk) return "warn"; // partial delivery across targets
    if (anyFailed) return "failed";
    if (anyOk) return "ok";
    return "pending"; // only skipped entries
  });
}

export function stepsByName(
  run: RotationRun,
): Record<(typeof RUN_STEP_NAMES)[number], RotationStep[]> {
  const steps = parseSteps(run.stepsJson);
  const grouped = Object.fromEntries(RUN_STEP_NAMES.map((n) => [n, [] as RotationStep[]])) as Record<
    (typeof RUN_STEP_NAMES)[number],
    RotationStep[]
  >;
  for (const s of steps) {
    if (grouped[s.step]) grouped[s.step].push(s);
  }
  return grouped;
}

/* ------------------------------------------------------------------ */
/* Labels & formatting                                                  */
/* ------------------------------------------------------------------ */

export function runLabel(id: number): string {
  return `run_${String(id).padStart(6, "0")}`;
}

/** Extract a numeric run id from a deep-link/search token like "run_000142" or "142". */
export function parseRunParam(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function runDurationMs(run: RotationRun): number {
  const started = new Date(run.startedAt).getTime();
  if (run.finishedAt) return Math.max(0, new Date(run.finishedAt).getTime() - started);
  const steps = parseSteps(run.stepsJson);
  if (steps.length > 0) return steps.reduce((acc, s) => acc + (s.durationMs || 0), 0);
  return Math.max(0, Date.now() - started);
}

export function relativeTime(input: Date | string | number): string {
  const then = new Date(input).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clockTime(input: Date | string | number): string {
  return new Date(input).toLocaleTimeString(undefined, { hour12: false });
}

export function actorForTrigger(trigger: RotationRun["trigger"]): string {
  if (trigger === "scheduled") return "policy-engine";
  if (trigger === "retry") return "web-user · retry";
  return "web-user";
}

/* ------------------------------------------------------------------ */
/* Status metadata                                                      */
/* ------------------------------------------------------------------ */

export type RunStatus = RotationRun["status"];

export const RUN_STATUS_META: Record<
  RunStatus,
  { label: string; chip: string; dot: string }
> = {
  committed: {
    label: "committed",
    chip: "border-spin-dim bg-spin/10 text-spin",
    dot: "bg-spin",
  },
  partial: {
    label: "partial",
    chip: "border-warn/50 bg-warn/10 text-warn",
    dot: "bg-warn",
  },
  failed: {
    label: "failed",
    chip: "border-danger/50 bg-danger/10 text-danger",
    dot: "bg-danger",
  },
  running: {
    label: "running",
    chip: "border-info/50 bg-info/10 text-info",
    dot: "bg-info",
  },
};

export const TRIGGER_META: Record<RotationRun["trigger"], { label: string; chip: string }> = {
  scheduled: { label: "policy", chip: "border-line-strong text-ink-muted" },
  manual: { label: "manual", chip: "border-info/50 text-info" },
  retry: { label: "retry", chip: "border-violet/50 text-violet" },
};

/** First failed step entry (for failure insight + retry affordances). */
export function firstFailedStep(run: RotationRun): RotationStep | null {
  return parseSteps(run.stepsJson).find((s) => s.status === "failed") ?? null;
}
