import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { FingerprintChip, toastError, toastSuccess } from "@/components/primitives";
import { relativeTime } from "@/components/runs/run-utils";
import { cn } from "@/lib/utils";

/**
 * Integrity banner — violet left-border card reporting hash-chain health.
 * "Re-verify" re-runs audit.verifyChain and toasts the result.
 */
export default function IntegrityBanner({ headHash }: { headHash: string | null }) {
  const verify = trpc.audit.verifyChain.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const reverify = async () => {
    const res = await verify.refetch();
    const v = res.data;
    if (!v) return;
    if (v.valid) toastSuccess("Chain intact", `${v.checked}/${v.checked} records verified`);
    else toastError("Chain broken", `verification failed at record #${v.brokenAtId}`);
  };

  const v = verify.data;
  const verifying = verify.isFetching;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "panel-light flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line-subtle border-l-2 bg-panel px-4 py-3.5",
        v && !v.valid ? "border-l-danger" : "border-l-violet",
      )}
    >
      {v && !v.valid ? (
        <ShieldAlert className="size-5 shrink-0 text-danger" />
      ) : (
        <ShieldCheck className="size-5 shrink-0 text-spin" />
      )}

      <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink-secondary">
        {verify.isLoading ? (
          "Verifying hash chain…"
        ) : verify.isError ? (
          <span className="text-danger">chain verification failed: {verify.error.message}</span>
        ) : v?.valid ? (
          <>
            <span className="text-spin">Chain intact</span> — every record links to the previous
            record's hash. Tampering anywhere breaks the chain.
          </>
        ) : v ? (
          <span className="text-danger">
            Chain broken at record #{v.brokenAtId} — {v.checked} records checked. Investigate
            immediately.
          </span>
        ) : null}
      </p>

      <div className="flex items-center gap-2">
        {headHash && (
          <span className="flex items-center gap-1.5">
            <span className="text-mono-s text-ink-muted">head:</span>
            <FingerprintChip fingerprint={headHash} />
          </span>
        )}
        {v && (
          <span className="text-mono-s rounded-chip border border-line-subtle bg-inset px-2 py-1 text-ink-secondary">
            records: <span className="tnum text-ink-primary">{v.checked}</span>
          </span>
        )}
        {verify.dataUpdatedAt > 0 && (
          <span className="text-mono-s hidden text-ink-muted lg:inline">
            verified {relativeTime(verify.dataUpdatedAt)}
          </span>
        )}
        <button
          onClick={reverify}
          disabled={verifying}
          className="flex items-center gap-2 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary disabled:opacity-60"
        >
          {verifying && <span className="spin-loader inline-block size-3.5" />}
          Re-verify
        </button>
      </div>
    </motion.div>
  );
}
