import { Link } from "react-router";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, RotateCw, ScrollText, X } from "lucide-react";
import type { RotationRun, RotationStep } from "@contracts/topspin";
import { RUN_STEP_NAMES } from "@contracts/topspin";
import { FingerprintChip, PipelineStepper } from "@/components/primitives";
import { cn } from "@/lib/utils";
import {
  clockTime,
  formatMs,
  runLabel,
  runStepStates,
  stepsByName,
} from "./run-utils";

const STEP_STATUS_ICON = {
  ok: <Check className="size-3 text-spin" />,
  failed: <X className="size-3 text-danger" />,
  skipped: <span className="size-3 text-center font-mono text-[10px] leading-3 text-ink-muted">–</span>,
  running: (
    <span
      className="spin-loader inline-block size-3"
      style={{ background: "conic-gradient(from 0deg, #5EA8FF, transparent 70%)" }}
    />
  ),
} as const;

function StepLogBlock({
  name,
  entries,
  index,
  onFailureClick,
}: {
  name: string;
  entries: RotationStep[];
  index: number;
  onFailureClick: () => void;
}) {
  const hasFailed = entries.some((e) => e.status === "failed");
  const isRunning = entries.some((e) => e.status === "running");
  const totalMs = entries.reduce((acc, e) => acc + (e.durationMs || 0), 0);
  const firstTs = entries[0]?.startedAt;

  const body = (
    <>
      <div className="flex items-center gap-2 border-b border-line-subtle/60 px-3 py-2">
        <span className="text-label font-mono uppercase text-ink-secondary">{name}</span>
        {entries.length === 0 ? (
          <span className="size-3 text-center font-mono text-[10px] leading-3 text-ink-faint">–</span>
        ) : (
          STEP_STATUS_ICON[
            hasFailed ? "failed" : isRunning ? "running" : entries[entries.length - 1].status
          ]
        )}
        <span className="ml-auto font-mono text-[11px] leading-4 text-ink-muted">
          {entries.length > 0 ? formatMs(totalMs) : "—"}
        </span>
        {firstTs && (
          <span className="text-mono-s text-ink-faint">{clockTime(firstTs)}</span>
        )}
      </div>
      <div className="space-y-1 px-3 py-2">
        {entries.length === 0 && (
          <p className="font-mono text-[11px] leading-4 text-ink-faint">· not reached</p>
        )}
        {entries.map((e, i) => (
          <div key={i} className="font-mono text-[11px] leading-4">
            <span className="text-ink-faint">→ </span>
            <span className="text-ink-muted">
              {e.step}
              {e.targetKind ? ` · ${e.targetKind}` : ""} · t+{formatMs(e.durationMs || 0)}
            </span>
            <br />
            <span className="text-ink-faint">← </span>
            <span
              className={cn(
                e.status === "failed"
                  ? "text-danger"
                  : e.status === "running"
                    ? "text-info"
                    : e.step === "audit"
                      ? "text-violet"
                      : "text-ink-secondary",
              )}
            >
              {e.message}
              {e.status === "skipped" ? " (skipped)" : ""}
            </span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 * index, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "overflow-hidden rounded-control border border-line-subtle/70 bg-inset",
        hasFailed && "border-l-2 border-l-danger",
        isRunning && "animate-tick-pulse border-info/50",
        hasFailed && "cursor-pointer transition-colors hover:border-danger/60",
      )}
      onClick={hasFailed ? onFailureClick : undefined}
      role={hasFailed ? "button" : undefined}
      title={hasFailed ? "Open failure insight" : undefined}
    >
      {body}
    </motion.div>
  );
}

/**
 * Expanded run row — large PipelineStepper + per-step terminal log stack +
 * fingerprint footer + actions (audit cross-link, retry).
 */
export default function RunDetail({
  run,
  onRetry,
  retrying,
  onOpenFailure,
}: {
  run: RotationRun;
  onRetry: (id: number) => void;
  retrying: boolean;
  onOpenFailure: (run: RotationRun) => void;
}) {
  const states = runStepStates(run);
  const grouped = stepsByName(run);
  const canRetry = run.status === "failed" || run.status === "partial";

  return (
    <div className="border-t border-line-subtle/60 bg-abyss/40 px-6 py-5">
      <PipelineStepper steps={states} nodeSize={24} className="mb-5 justify-center" />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {RUN_STEP_NAMES.map((name, i) => (
          <StepLogBlock
            key={name}
            name={name}
            entries={grouped[name]}
            index={i}
            onFailureClick={() => onOpenFailure(run)}
          />
        ))}
      </div>

      {run.error && (
        <div className="mt-4 flex items-start gap-2 rounded-control border border-danger/40 bg-danger/5 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
          <p className="font-mono text-[11px] leading-4 text-danger">{run.error}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-label text-ink-muted">Fingerprint</span>
        {run.newFingerprint ? (
          <span className="flex items-center gap-2">
            <span className="text-mono-s text-ink-muted">new:</span>
            <FingerprintChip fingerprint={run.newFingerprint} />
          </span>
        ) : (
          <span className="text-mono-s text-ink-muted">old value retained · no new fingerprint</span>
        )}

        <span className="ml-auto flex items-center gap-2">
          <Link
            to={`/audit?q=${runLabel(run.id)}`}
            className="flex items-center gap-1.5 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            <ScrollText className="size-3.5" />
            View in audit log
          </Link>
          {canRetry && (
            <button
              onClick={() => onRetry(run.id)}
              disabled={retrying}
              className="group flex items-center gap-2 rounded-control bg-spin px-3.5 py-1.5 text-[13px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            >
              {retrying ? (
                <span className="spin-loader inline-block size-3.5" />
              ) : (
                <RotateCw className="size-3.5 transition-transform duration-300 group-hover:rotate-90" />
              )}
              Retry from failed step
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
