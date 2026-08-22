import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, Search, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { EmptyState, FingerprintChip } from "@/components/primitives";
import { cn } from "@/lib/utils";
import IntegrityBanner from "@/components/audit/IntegrityBanner";
import EventExpanded from "@/components/audit/EventExpanded";
import ChainStrip from "@/components/audit/ChainStrip";
import ExportModal from "@/components/audit/ExportModal";
import {
  SEVERITY_DOT,
  actionChipClass,
  actionPrefix,
  describeEntry,
  detailObj,
  groupByDay,
  resourceLabel,
  runIdOf,
  severityOf,
} from "@/components/audit/audit-utils";
import type { Severity } from "@/components/audit/audit-utils";
import { clockTime } from "@/components/runs/run-utils";

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

const SEV_CHIPS: { key: Severity; label: string }[] = [
  { key: "info", label: "info" },
  { key: "notice", label: "notice" },
  { key: "critical", label: "critical" },
];

export default function Audit() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<Severity | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  const utils = trpc.useUtils();

  const auditQuery = trpc.audit.list.useQuery(
    { limit: 300 },
    { refetchOnWindowFocus: false, staleTime: 15_000 },
  );
  const secretsQuery = trpc.secrets.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  // shared cache key with IntegrityBanner — used here for the chain strip
  const verifyQuery = trpc.audit.verifyChain.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const entries = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);

  const secretName = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of secretsQuery.data ?? []) map.set(s.id, s.name);
    return (id: number | null) => (id != null ? map.get(id) : undefined);
  }, [secretsQuery.data]);

  const typePrefixes = useMemo(
    () => [...new Set(entries.map((e) => actionPrefix(e.action)))].sort(),
    [entries],
  );
  const actors = useMemo(
    () => [...new Set(entries.map((e) => e.actor))].sort().slice(0, 8),
    [entries],
  );

  const filtersActive =
    q.trim() !== "" || typeFilter !== null || actorFilter !== null || sevFilter !== null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter && actionPrefix(e.action) !== typeFilter) return false;
      if (actorFilter && e.actor !== actorFilter) return false;
      if (sevFilter && severityOf(e) !== sevFilter) return false;
      if (!needle) return true;
      const rid = runIdOf(e);
      const haystack = [
        e.actor,
        e.action,
        e.prevHash,
        e.entryHash,
        String(e.id),
        rid ? `run_${String(rid).padStart(6, "0")}` : "",
        rid ? String(rid) : "",
        secretName(e.secretId) ?? "",
        JSON.stringify(e.detailJson ?? null),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, q, typeFilter, actorFilter, sevFilter, secretName]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const jumpTo = (id: number) => {
    setExpandedId(id);
    setFlashId(id);
    window.setTimeout(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
  };

  // Deep link: /audit?q=<run-id> — prefill search and expand the matching event.
  const deepHandled = useRef(false);
  useEffect(() => {
    if (deepHandled.current || entries.length === 0) return;
    const needle = (searchParams.get("q") ?? "").replace(/\D/g, "");
    if (!needle) return;
    deepHandled.current = true;
    const match = entries.find((e) => runIdOf(e) === Number(needle));
    if (!match) return;
    const t = window.setTimeout(() => jumpTo(match.id), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const clearAll = () => {
    setQ("");
    setTypeFilter(null);
    setActorFilter(null);
    setSevFilter(null);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
            Audit log
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            {entries.length} events loaded · append-only · hash-chained
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void utils.audit.verifyChain.invalidate()}
            className="flex items-center gap-1.5 rounded-control border border-line-subtle px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            <ShieldCheck className="size-3.5" />
            Verify chain
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 rounded-control border border-spin-dim bg-spin/5 px-3 py-1.5 text-[13px] font-medium text-spin transition-colors hover:bg-spin/15"
          >
            <Download className="size-3.5" />
            Export (CSV / JSON)
          </button>
        </div>
      </div>

      {/* Integrity banner */}
      <div className="mt-5">
        <IntegrityBanner headHash={entries[0]?.entryHash ?? null} />
      </div>

      {/* Filter bar (sticky) */}
      <div className="sticky top-16 z-20 -mx-2 mt-5 border border-line-subtle/70 bg-abyss/90 px-2 py-3 backdrop-blur-md rounded-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-full max-w-sm items-center gap-2 rounded-control border border-line-subtle bg-inset px-3 transition-colors focus-within:border-line-strong">
            <Search className="size-3.5 shrink-0 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search actor, resource, run id, hash…"
              className="w-full bg-transparent font-mono text-[13px] text-ink-primary outline-none placeholder:text-ink-muted"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {typePrefixes.map((p) => (
              <Chip
                key={p}
                active={typeFilter === p}
                onClick={() => setTypeFilter((cur) => (cur === p ? null : p))}
              >
                {p}.*
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {actors.map((a) => (
              <Chip
                key={a}
                active={actorFilter === a}
                onClick={() => setActorFilter((cur) => (cur === a ? null : a))}
              >
                {a}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {SEV_CHIPS.map((c) => (
              <Chip
                key={c.key}
                active={sevFilter === c.key}
                onClick={() => setSevFilter((cur) => (cur === c.key ? null : c.key))}
              >
                {c.label}
              </Chip>
            ))}
          </div>

          <span className="ml-auto flex items-center gap-3">
            <motion.span
              key={filtered.length}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="tnum font-mono text-[11px] leading-4 text-ink-muted"
            >
              {filtered.length} events
            </motion.span>
            {filtersActive && (
              <button
                onClick={clearAll}
                className="text-[13px] text-info transition-colors hover:text-ink-primary"
              >
                clear all
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Event stream */}
      <div className="mt-5">
        {auditQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-card border border-line-subtle bg-panel"
              />
            ))}
          </div>
        ) : auditQuery.isError ? (
          <div className="rounded-card border border-danger/40 bg-panel p-10 text-center">
            <p className="font-mono text-[13px] text-danger">
              failed to load audit log: {auditQuery.error.message}
            </p>
            <button
              onClick={() => auditQuery.refetch()}
              className="mt-4 rounded-control border border-line-subtle px-4 py-2 text-[13px] text-ink-secondary hover:border-line-strong hover:text-ink-primary"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-card border border-line-subtle bg-panel">
            <EmptyState
              title={entries.length === 0 ? "Nothing recorded yet" : "No events match these filters"}
              body={
                entries.length === 0
                  ? "Every rotation, policy change, target update, and login lands here as a hash-chained record."
                  : "Try clearing the search or widening the filter chips."
              }
              action={
                filtersActive ? (
                  <button
                    onClick={clearAll}
                    className="rounded-control border border-line-subtle px-4 py-2 text-sm text-ink-secondary hover:border-line-strong hover:text-ink-primary"
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-6">
              <div className="sticky top-[124px] z-10 -mx-2 bg-abyss/90 px-2 py-1.5 backdrop-blur-md">
                <span className="text-mono-s uppercase text-ink-faint">{group.label}</span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {group.entries.map((e, idx) => {
                  const sev = severityOf(e);
                  const expanded = expandedId === e.id;
                  const resource = resourceLabel(e, secretName(e.secretId));
                  return (
                    <motion.div
                      key={e.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(e.id, el);
                        else rowRefs.current.delete(e.id);
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx, 10) * 0.03, duration: 0.25 }}
                      className={cn(
                        "overflow-x-auto rounded-card border bg-panel transition-colors",
                        flashId === e.id
                          ? "animate-tick-pulse border-spin"
                          : expanded
                            ? "border-line-strong"
                            : "border-line-subtle hover:border-line-strong/70",
                      )}
                    >
                      <div
                        onClick={() => setExpandedId((cur) => (cur === e.id ? null : e.id))}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ")
                            setExpandedId((cur) => (cur === e.id ? null : e.id));
                        }}
                        className="grid w-full min-w-[900px] cursor-pointer grid-cols-[10px_56px_150px_130px_minmax(0,1fr)_140px_120px_20px] items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className={cn("size-2 rounded-full", SEVERITY_DOT[sev])} />
                        <span className="tnum font-mono text-[11px] leading-4 text-ink-muted">
                          {clockTime(e.ts)}
                        </span>
                        <span
                          className={cn(
                            "text-mono-s w-fit rounded-chip border px-2 py-0.5",
                            actionChipClass(e.action),
                          )}
                        >
                          {e.action}
                        </span>
                        <span className="truncate font-mono text-[11px] leading-4 text-ink-secondary">
                          {e.actor}
                        </span>
                        <span className="truncate text-[13px] leading-5 text-ink-secondary">
                          {describeEntry(e, secretName(e.secretId))}
                        </span>
                        <span className="truncate font-mono text-[11px] leading-4 text-ink-muted">
                          {resource ?? (detailObj(e)?.platform ? String(detailObj(e)!.platform) : "—")}
                        </span>
                        <span onClick={(ev) => ev.stopPropagation()}>
                          <FingerprintChip fingerprint={e.entryHash} />
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 text-ink-muted transition-transform duration-200",
                            expanded && "rotate-180 text-spin",
                          )}
                        />
                      </div>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <EventExpanded entry={e} entries={entries} onJump={jumpTo} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Chain visualization */}
      {!auditQuery.isLoading && !auditQuery.isError && entries.length > 0 && (
        <ChainStrip
          entries={entries}
          brokenAtId={verifyQuery.data && !verifyQuery.data.valid ? verifyQuery.data.brokenAtId : null}
          secretName={secretName}
          onJump={jumpTo}
        />
      )}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filtered={filtered}
        all={entries}
        filtersActive={filtersActive}
      />
    </div>
  );
}
