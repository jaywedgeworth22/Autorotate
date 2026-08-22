import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  Download,
  RotateCw,
  Search,
  Radio,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { RotationRun } from "@contracts/topspin";
import { EmptyState, toastError, toastSuccess } from "@/components/primitives";
import { cn } from "@/lib/utils";
import LiveBar from "@/components/runs/LiveBar";
import RunDetail from "@/components/runs/RunDetail";
import FailureDrawer from "@/components/runs/FailureDrawer";
import StatsStrip from "@/components/runs/StatsStrip";
import { MiniStepper } from "@/components/runs/MiniStepper";
import {
  RUN_STATUS_META,
  TRIGGER_META,
  actorForTrigger,
  formatMs,
  parseRunParam,
  relativeTime,
  runDurationMs,
  runLabel,
  runStepStates,
} from "@/components/runs/run-utils";

type StatusFilter = "all" | "committed" | "partial" | "failed" | "running";
type TriggerFilter = "all" | RotationRun["trigger"];

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "committed", label: "Success" },
  { key: "partial", label: "Partial" },
  { key: "failed", label: "Failed" },
  { key: "running", label: "Running" },
];

const TRIGGER_CHIPS: { key: TriggerFilter; label: string }[] = [
  { key: "all", label: "All triggers" },
  { key: "scheduled", label: "Policy" },
  { key: "manual", label: "Manual" },
  { key: "retry", label: "Retry" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-chip border px-2.5 py-1 font-mono text-[11px] leading-4 tracking-[0.02em] transition-all duration-150",
        active
          ? "border-spin-dim bg-spin/10 text-spin"
          : "border-line-subtle text-ink-muted hover:border-line-strong hover:text-ink-secondary",
      )}
    >
      {children}
    </button>
  );
}

export default function Runs() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
  const [live, setLive] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [failureRunId, setFailureRunId] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const utils = trpc.useUtils();

  const runsQuery = trpc.runs.list.useQuery(
    { limit: 100 },
    { refetchInterval: live ? 10_000 : false, refetchOnWindowFocus: false },
  );
  const secretsQuery = trpc.secrets.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const secretById = useMemo(() => {
    const map = new Map<number, { name: string; platform: string }>();
    for (const s of secretsQuery.data ?? []) {
      map.set(s.id, { name: s.name, platform: s.connector?.platform ?? "generic" });
    }
    return map;
  }, [secretsQuery.data]);

  const retry = trpc.runs.retry.useMutation({
    onSuccess: (fresh) => {
      toastSuccess(
        "Retry started",
        fresh ? `${runLabel(fresh.id)} — pipeline re-cascading from the failed step` : undefined,
      );
      void utils.runs.list.invalidate();
      if (fresh) setExpandedId(fresh.id);
    },
    onError: (err) => toastError("Retry rejected", err.message),
  });

  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  const liveRun = useMemo(() => runs.find((r) => r.status === "running") ?? null, [runs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = runs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (triggerFilter !== "all" && r.trigger !== triggerFilter) return false;
      if (!q) return true;
      const secret = secretById.get(r.secretId);
      const haystack = [
        runLabel(r.id),
        String(r.id),
        secret?.name ?? "",
        secret?.platform ?? "",
        r.trigger,
        r.status,
        actorForTrigger(r.trigger),
        r.error ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    out = [...out].sort((a, b) => {
      const av = new Date(a.startedAt).getTime();
      const bv = new Date(b.startedAt).getTime();
      return sortDesc ? bv - av : av - bv;
    });
    return out;
  }, [runs, search, statusFilter, triggerFilter, secretById, sortDesc]);

  const headerStats = useMemo(() => {
    const finished = runs.filter((r) => r.status !== "running");
    const ok = finished.filter((r) => r.status === "committed").length;
    const pct = finished.length ? ((ok / finished.length) * 100).toFixed(1) : "100.0";
    return { total: runs.length, pct };
  }, [runs]);

  const expandAndScroll = (id: number) => {
    setExpandedId(id);
    window.setTimeout(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  // Deep link: /runs?run=<id> — auto-expand + scroll once data is available.
  const deepLinked = parseRunParam(searchParams.get("run"));
  const deepLinkHandled = useRef<number | null>(null);
  useEffect(() => {
    if (deepLinked === null) {
      deepLinkHandled.current = null;
      return;
    }
    if (deepLinkHandled.current === deepLinked) return;
    if (!runs.some((r) => r.id === deepLinked)) return;
    deepLinkHandled.current = deepLinked;
    const t = window.setTimeout(() => expandAndScroll(deepLinked), 0);
    return () => window.clearTimeout(t);
  }, [deepLinked, runs]);

  const toggleRow = (id: number) => setExpandedId((cur) => (cur === id ? null : id));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topspin-runs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess("Export ready", `${filtered.length} runs written to JSON`);
  };

  const failureRun = failureRunId !== null ? runs.find((r) => r.id === failureRunId) ?? null : null;

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
            Rotation runs
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            {headerStats.total} runs in the loaded window · {headerStats.pct}% success
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-mono-s rounded-chip border border-line-subtle px-2.5 py-1.5 text-ink-muted">
            last 100 runs
          </span>
          <button
            onClick={exportJson}
            className="flex items-center gap-1.5 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            <Download className="size-3.5" />
            Export JSON
          </button>
          <button
            onClick={() => setLive((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-[13px] transition-colors",
              live
                ? "border-spin-dim bg-spin/10 text-spin"
                : "border-line-subtle text-ink-muted hover:border-line-strong hover:text-ink-secondary",
            )}
            title={live ? "Polling every 10s — click to pause" : "Live polling paused — click to resume"}
          >
            <Radio className={cn("size-3.5", live && "animate-tick-pulse")} />
            {live ? "Live" : "Paused"}
          </button>
        </div>
      </div>

      {/* Live bar */}
      <div className="mt-5">
        <LiveBar
          run={liveRun}
          secretName={liveRun ? (secretById.get(liveRun.secretId)?.name ?? `secret #${liveRun.secretId}`) : ""}
          onWatch={expandAndScroll}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-full max-w-xs items-center gap-2 rounded-control border border-line-subtle bg-inset px-3 transition-colors focus-within:border-line-strong">
          <Search className="size-3.5 shrink-0 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="run id, secret, actor…"
            className="w-full bg-transparent font-mono text-[13px] text-ink-primary outline-none placeholder:text-ink-muted"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_CHIPS.map((c) => (
            <Chip key={c.key} active={statusFilter === c.key} onClick={() => setStatusFilter(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {TRIGGER_CHIPS.map((c) => (
            <Chip key={c.key} active={triggerFilter === c.key} onClick={() => setTriggerFilter(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-card border border-line-subtle bg-panel">
        {runsQuery.isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-control bg-raised/70" />
            ))}
          </div>
        ) : runsQuery.isError ? (
          <div className="p-10 text-center">
            <p className="font-mono text-[13px] text-danger">failed to load runs: {runsQuery.error.message}</p>
            <button
              onClick={() => runsQuery.refetch()}
              className="mt-4 rounded-control border border-line-subtle px-4 py-2 text-[13px] text-ink-secondary hover:border-line-strong hover:text-ink-primary"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          runs.length === 0 ? (
            <EmptyState
              title="Nothing has rotated yet"
              body="When a secret rotates, the full LOCK → AUDIT pipeline lands here with per-step logs and timings."
              action={
                <Link
                  to="/secrets"
                  className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                >
                  <RotateCw className="size-4" />
                  Rotate your first secret
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No runs match these filters"
              body="Try widening the status or trigger filters, or clear the search."
              action={
                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setTriggerFilter("all");
                  }}
                  className="rounded-control border border-line-subtle px-4 py-2 text-sm text-ink-secondary hover:border-line-strong hover:text-ink-primary"
                >
                  Clear filters
                </button>
              }
            />
          )
        ) : (
          <table className="w-full min-w-[1020px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-line-subtle">
                <th className="px-4 py-3"><span className="text-label text-ink-muted">Run</span></th>
                <th className="px-4 py-3"><span className="text-label text-ink-muted">Secret</span></th>
                <th className="px-4 py-3"><span className="text-label text-ink-muted">Pipeline</span></th>
                <th className="px-4 py-3"><span className="text-label text-ink-muted">Result</span></th>
                <th className="px-4 py-3"><span className="text-label text-ink-muted">Duration</span></th>
                <th className="px-4 py-3"><span className="text-label text-ink-muted">Actor</span></th>
                <th className="px-4 py-3">
                  <button
                    onClick={() => setSortDesc((d) => !d)}
                    className="text-label flex cursor-pointer items-center gap-1.5 text-ink-muted hover:text-ink-secondary"
                  >
                    When
                    {sortDesc ? (
                      <ArrowDownWideNarrow className="size-3.5 text-spin" />
                    ) : (
                      <ArrowUpNarrowWide className="size-3.5 text-spin" />
                    )}
                  </button>
                </th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((run, rowIdx) => {
                const meta = RUN_STATUS_META[run.status];
                const trig = TRIGGER_META[run.trigger];
                const secret = secretById.get(run.secretId);
                const expanded = expandedId === run.id;
                return [
                  <motion.tr
                    key={run.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(run.id, el);
                      else rowRefs.current.delete(run.id);
                    }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(rowIdx, 12) * 0.04, duration: 0.25 }}
                    onClick={() => toggleRow(run.id)}
                    className={cn(
                      "h-11 cursor-pointer border-b border-line-subtle/60 text-[13px] leading-5 text-ink-secondary transition-colors hover:bg-raised",
                      expanded && "bg-raised/60",
                    )}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] text-ink-primary">{runLabel(run.id)}</span>
                        <span className={cn("text-mono-s rounded-chip border px-1.5 py-0.5 uppercase", trig.chip)}>
                          {trig.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-mono-s flex size-6 items-center justify-center rounded-chip border border-line-subtle bg-raised uppercase text-ink-secondary">
                          {(secret?.platform ?? "?").slice(0, 2)}
                        </span>
                        <span className="font-mono text-[13px] text-ink-secondary">
                          {secret?.name ?? `secret #${run.secretId}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <MiniStepper steps={runStepStates(run)} />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "text-mono-s inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 uppercase",
                          meta.chip,
                        )}
                      >
                        {run.status === "running" ? (
                          <span
                            className="spin-loader inline-block size-2"
                            style={{ background: "conic-gradient(from 0deg, #5EA8FF, transparent 70%)" }}
                          />
                        ) : (
                          <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        )}
                        {meta.label}
                      </span>
                    </td>
                    <td className="tnum px-4 py-2 font-mono text-[11px] leading-4 text-ink-secondary">
                      {run.status === "running" ? "…" : formatMs(runDurationMs(run))}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] leading-4 text-ink-muted">
                      {actorForTrigger(run.trigger)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] leading-4 text-ink-muted">
                      {relativeTime(run.startedAt)}
                    </td>
                    <td className="px-2 py-2">
                      <ChevronDown
                        className={cn(
                          "size-4 text-ink-muted transition-transform duration-200",
                          expanded && "rotate-180 text-spin",
                        )}
                      />
                    </td>
                  </motion.tr>,
                  <AnimatePresence key={`${run.id}-exp`} initial={false}>
                    {expanded && (
                      <tr className="border-b border-line-subtle/60">
                        <td colSpan={8} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <RunDetail
                              run={run}
                              retrying={retry.isPending}
                              onRetry={(id) => retry.mutate({ id })}
                              onOpenFailure={(r) => setFailureRunId(r.id)}
                            />
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>,
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom stats strip */}
      {!runsQuery.isLoading && !runsQuery.isError && runs.length > 0 && <StatsStrip runs={runs} />}

      {/* Failure insight drawer */}
      <FailureDrawer
        runId={failureRunId}
        secretName={failureRun ? (secretById.get(failureRun.secretId)?.name ?? `secret #${failureRun.secretId}`) : ""}
        onClose={() => setFailureRunId(null)}
        onRetry={(id) => retry.mutate({ id })}
        retrying={retry.isPending}
      />
    </div>
  );
}
