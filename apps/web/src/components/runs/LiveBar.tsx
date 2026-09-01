import { motion, AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";
import type { RotationRun } from "@contracts/autorotate";
import { RUN_STEP_NAMES } from "@contracts/autorotate";
import { ElapsedTicker } from "./MiniStepper";
import { parseSteps, runLabel } from "./run-utils";

/**
 * Live bar — appears when a run is in progress.
 * Spin loader + mono run descriptor + ticking elapsed counter + watch link.
 */
export default function LiveBar({
  run,
  secretName,
  onWatch,
}: {
  run: RotationRun | null;
  secretName: string;
  onWatch: (id: number) => void;
}) {
  const steps = run ? parseSteps(run.stepsJson) : [];
  const currentIdx = run
    ? (() => {
        const runningIdx = steps.findIndex((s) => s.status === "running");
        if (runningIdx >= 0) return runningIdx;
        // fall back to count of resolved steps
        const done = steps.filter((s) => s.status === "ok" || s.status === "failed").length;
        return Math.min(done, RUN_STEP_NAMES.length - 1);
      })()
    : 0;
  const currentName = RUN_STEP_NAMES[Math.min(currentIdx, RUN_STEP_NAMES.length - 1)];

  return (
    <AnimatePresence>
      {run && (
        <motion.div
          initial={{ opacity: 0, y: -24, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -24, height: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-4 rounded-card border border-info/40 bg-panel px-4 py-3">
            <span
              className="spin-loader inline-block size-5 shrink-0"
              style={{ background: "conic-gradient(from 0deg, #5EA8FF, #2EE6A8 55%, transparent 75%)" }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-5 text-ink-secondary">
              <span className="text-ink-primary">{runLabel(run.id)}</span>
              <span className="text-ink-faint"> · </span>
              {secretName}
              <span className="text-ink-faint"> · </span>
              step {currentIdx + 1}/{RUN_STEP_NAMES.length}{" "}
              <span className="uppercase text-info">{currentName}…</span>
            </span>
            <ElapsedTicker since={run.startedAt} />
            <button
              onClick={() => onWatch(run.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-control border border-info/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.02em] text-info transition-colors hover:bg-info/10"
            >
              <Eye className="size-3.5" />
              watch
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
