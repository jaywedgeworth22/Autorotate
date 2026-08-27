import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Link2 } from "lucide-react";
import type { AuditEntry } from "@contracts/autorotate";
import { FingerprintChip } from "@/components/primitives";
import { runIdOf, runLabel } from "./audit-utils";

function Line({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.025 * index, duration: 0.2 }}
      className="whitespace-pre-wrap break-all"
    >
      {children}
    </motion.div>
  );
}

const K = ({ children }: { children: React.ReactNode }) => (
  <span className="text-ink-muted">{children}</span>
);
const S = ({ children }: { children: React.ReactNode }) => (
  <span className="text-spin">{children}</span>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <span className="text-violet">{children}</span>
);
const N = ({ children }: { children: React.ReactNode }) => (
  <span className="text-info">{children}</span>
);

/**
 * Expanded audit event — full record block (syntax-tinted), chain context
 * with prev/next hops, and a cross-link to the rotation run when present.
 */
export default function EventExpanded({
  entry,
  entries,
  onJump,
}: {
  entry: AuditEntry;
  entries: AuditEntry[];
  onJump: (id: number) => void;
}) {
  const prev = entries.find((e) => e.entryHash === entry.prevHash) ?? null;
  const next = entries.find((e) => e.prevHash === entry.entryHash) ?? null;
  const runId = runIdOf(entry);

  return (
    <div className="min-w-[900px] border-t border-line-subtle/60 bg-inset px-4 py-4">
      <div className="rounded-control border border-line-subtle/70 bg-abyss/60 p-4 font-mono text-[11px] leading-5">
        <Line index={0}>{"{"}</Line>
        <Line index={1}>
          {"  "}
          <K>"id"</K>: <N>{entry.id}</N>,
        </Line>
        <Line index={2}>
          {"  "}
          <K>"ts"</K>: <S>"{new Date(entry.ts).toISOString()}"</S>,
        </Line>
        <Line index={3}>
          {"  "}
          <K>"actor"</K>: <S>"{entry.actor}"</S>,
        </Line>
        <Line index={4}>
          {"  "}
          <K>"action"</K>: <S>"{entry.action}"</S>,
        </Line>
        <Line index={5}>
          {"  "}
          <K>"secret_id"</K>:{" "}
          {entry.secretId != null ? <N>{entry.secretId}</N> : <span className="text-ink-muted">null</span>},
        </Line>
        <Line index={6}>
          {"  "}
          <K>"detail"</K>:{" "}
          {entry.detailJson != null ? (
            <S>{JSON.stringify(entry.detailJson)}</S>
          ) : (
            <span className="text-ink-muted">null</span>
          )}
          ,
        </Line>
        <Line index={7}>
          {"  "}
          <K>"prev_hash"</K>: <H>"{entry.prevHash}"</H>,
        </Line>
        <Line index={8}>
          {"  "}
          <K>"hash"</K>: <H>"{entry.entryHash}"</H>
        </Line>
        <Line index={9}>{"}"}</Line>
      </div>

      {/* Chain context */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-label flex items-center gap-1.5 text-ink-muted">
          <Link2 className="size-3" />
          Chain context
        </span>
        {prev ? (
          <button
            onClick={() => onJump(prev.id)}
            className="group flex items-center gap-1.5"
            title={`Jump to previous record #${prev.id}`}
          >
            <ArrowLeft className="size-3 text-ink-muted transition-transform group-hover:-translate-x-0.5" />
            <FingerprintChip fingerprint={prev.entryHash} />
          </button>
        ) : (
          <span className="text-mono-s text-ink-muted">genesis</span>
        )}
        <FingerprintChip fingerprint={entry.entryHash} className="ring-1 ring-violet/40" />
        {next ? (
          <button
            onClick={() => onJump(next.id)}
            className="group flex items-center gap-1.5"
            title={`Jump to next record #${next.id}`}
          >
            <FingerprintChip fingerprint={next.entryHash} />
            <ArrowRight className="size-3 text-ink-muted transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <span className="text-mono-s text-ink-muted">chain head</span>
        )}

        {runId && (
          <Link
            to={`/runs?run=${runId}`}
            className="ml-auto flex items-center gap-1.5 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            View run <span className="font-mono text-[11px] text-spin">{runLabel(runId)}</span>
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
