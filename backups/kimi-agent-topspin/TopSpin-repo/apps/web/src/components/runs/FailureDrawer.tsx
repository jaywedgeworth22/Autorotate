import { Link } from "react-router";
import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink, RotateCw, ScrollText } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { DetailDrawer, StatusDot } from "@/components/primitives";
import { clockTime, firstFailedStep, formatMs, parseSteps, runLabel } from "./run-utils";

/**
 * Failure insight drawer — opens from a failed step log block.
 * Shows error, attempt history, likely cause, and cross-links to the audit log.
 */
export default function FailureDrawer({
  runId,
  secretName,
  onClose,
  onRetry,
  retrying,
}: {
  runId: number | null;
  secretName: string;
  onClose: () => void;
  onRetry: (id: number) => void;
  retrying: boolean;
}) {
  const open = runId !== null;
  const query = trpc.runs.get.useQuery(
    { id: runId ?? 0 },
    { enabled: open, refetchOnWindowFocus: false },
  );
  const run = query.data;
  const failedStep = run ? firstFailedStep(run) : null;
  const steps = run ? parseSteps(run.stepsJson) : [];

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={
        run
          ? `${(failedStep?.step ?? "pipeline").toUpperCase()} failed — ${secretName}`
          : "Run detail"
      }
    >
      {query.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-card border border-line-subtle bg-raised" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-card border border-danger/40 bg-danger/5 p-4">
          <p className="font-mono text-[11px] leading-4 text-danger">
            failed to load run: {query.error.message}
          </p>
          <button
            onClick={() => query.refetch()}
            className="mt-3 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary hover:border-line-strong hover:text-ink-primary"
          >
            Retry
          </button>
        </div>
      )}

      {run && (
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-between"
          >
            <StatusDot state="overdue" label={run.status} />
            <span className="font-mono text-[11px] leading-4 text-ink-muted">
              {runLabel(run.id)} · {clockTime(run.startedAt)}
            </span>
          </motion.div>

          {/* Failure summary */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07, duration: 0.25 }}
            className="rounded-card border border-danger/40 bg-inset p-4"
          >
            <div className="text-label mb-2 text-danger">What happened</div>
            <p className="text-[13px] leading-5 text-ink-secondary">
              {run.error ?? "The pipeline did not complete."}
            </p>
            {failedStep && (
              <p className="mt-2 font-mono text-[11px] leading-4 text-ink-muted">
                error at step <span className="uppercase text-danger">{failedStep.step}</span>
                {failedStep.targetKind ? ` · target ${failedStep.targetKind}` : ""}
              </p>
            )}
          </motion.div>

          {/* Attempt history */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.25 }}
            className="rounded-card border border-line-subtle bg-inset p-4"
          >
            <div className="text-label mb-2 text-ink-muted">Step history</div>
            <div className="space-y-1.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-baseline gap-2 font-mono text-[11px] leading-4">
                  <span className="text-ink-faint">{clockTime(s.startedAt)}</span>
                  <span
                    className={
                      s.status === "failed"
                        ? "uppercase text-danger"
                        : s.status === "ok"
                          ? "uppercase text-spin"
                          : "uppercase text-ink-muted"
                    }
                  >
                    {s.step}
                  </span>
                  <span className="text-ink-muted">{formatMs(s.durationMs)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-secondary">{s.message}</span>
                </div>
              ))}
              {steps.length === 0 && (
                <p className="font-mono text-[11px] text-ink-faint">no steps recorded</p>
              )}
            </div>
          </motion.div>

          {/* Likely cause */}
          {failedStep && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.21, duration: 0.25 }}
              className="rounded-card border border-warn/40 bg-warn/5 p-4"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-warn" />
                <span className="text-label text-warn">Likely cause</span>
              </div>
              <p className="text-[13px] leading-5 text-ink-secondary">
                {failedStep.targetKind
                  ? `Delivery to the ${failedStep.targetKind} target did not complete. Check the target configuration and connectivity, then retry — the pipeline resumes from the failed step.`
                  : "The connector could not mint a new credential. Verify the connector's admin credential and scopes, then retry."}
              </p>
              {failedStep.targetKind && (
                <Link
                  to="/targets"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
                >
                  <ExternalLink className="size-3.5" />
                  Edit {failedStep.targetKind} target
                </Link>
              )}
            </motion.div>
          )}

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.25 }}
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            {(run.status === "failed" || run.status === "partial") && (
              <button
                onClick={() => onRetry(run.id)}
                disabled={retrying}
                className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
              >
                {retrying ? (
                  <span className="spin-loader inline-block size-4" />
                ) : (
                  <RotateCw className="size-4" />
                )}
                Retry step
              </button>
            )}
            <Link
              to={`/audit?q=${runLabel(run.id)}`}
              className="flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
            >
              <ScrollText className="size-4" />
              Open audit record
            </Link>
          </motion.div>
        </div>
      )}
    </DetailDrawer>
  );
}
