import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Braces, Check, FileSpreadsheet, X } from "lucide-react";
import type { AuditEntry } from "@contracts/topspin";
import { toastSuccess } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { downloadText, sha256Hex, toCsv } from "./audit-utils";

type Format = "json" | "csv";
type Scope = "filtered" | "all";

function RadioCard({
  selected,
  onClick,
  icon,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center gap-3 rounded-control border bg-inset px-3.5 py-3 text-left transition-colors duration-150",
        selected ? "border-spin" : "border-line-subtle hover:border-line-strong",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink-primary">{title}</span>
        <span className="text-mono-s block text-ink-muted">{hint}</span>
      </span>
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full border transition-colors",
          selected ? "border-spin bg-spin text-[#06231A]" : "border-line-strong",
        )}
      >
        {selected && <Check className="size-2.5" />}
      </span>
    </button>
  );
}

/**
 * Export modal — format / scope / chain proofs → client-side download +
 * fingerprinted toast (sha256 of the export payload).
 */
export default function ExportModal({
  open,
  onClose,
  filtered,
  all,
  filtersActive,
}: {
  open: boolean;
  onClose: () => void;
  filtered: AuditEntry[];
  all: AuditEntry[];
  filtersActive: boolean;
}) {
  const [format, setFormat] = useState<Format>("json");
  const [scope, setScope] = useState<Scope>("filtered");
  const [includeProofs, setIncludeProofs] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset transient state when the modal opens (adjust-state-during-render pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setGenerating(false);
      setScope(filtersActive ? "filtered" : "all");
    }
  }

  const generate = async () => {
    const entries = scope === "filtered" ? filtered : all;
    const date = new Date().toISOString().slice(0, 10);
    setGenerating(true);
    // deliberate 1s spin per design
    await new Promise((r) => window.setTimeout(r, 1000));
    const content =
      format === "json"
        ? JSON.stringify(
            entries.map((e) =>
              includeProofs
                ? e
                : { id: e.id, ts: e.ts, actor: e.actor, action: e.action, secretId: e.secretId, detail: e.detailJson },
            ),
            null,
            2,
          )
        : toCsv(entries, includeProofs);
    const filename = `audit-export-${date}.${format}`;
    downloadText(filename, content, format === "json" ? "application/json" : "text/csv");
    const fp = await sha256Hex(content);
    setGenerating(false);
    onClose();
    toastSuccess(
      `${filename} · sha256:${fp.slice(0, 4)}…${fp.slice(-4)}`,
      `${entries.length} records exported${includeProofs ? " with chain proofs" : ""} · fingerprint computed client-side`,
    );
  };

  const count = scope === "filtered" ? filtered.length : all.length;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[110] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-modal border border-line-subtle bg-raised p-6 shadow-pop"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-ink-primary">
                Export audit log
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-control p-1.5 text-ink-muted hover:bg-panel hover:text-ink-primary"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="text-label mb-2 text-ink-muted">Format</div>
            <div className="flex gap-3">
              <RadioCard
                selected={format === "json"}
                onClick={() => setFormat("json")}
                icon={<Braces className="size-5 shrink-0 text-spin" />}
                title="JSON"
                hint="full records"
              />
              <RadioCard
                selected={format === "csv"}
                onClick={() => setFormat("csv")}
                icon={<FileSpreadsheet className="size-5 shrink-0 text-info" />}
                title="CSV"
                hint="spreadsheet-ready"
              />
            </div>

            <div className="text-label mb-2 mt-5 text-ink-muted">Scope</div>
            <div className="flex gap-3">
              <RadioCard
                selected={scope === "filtered"}
                onClick={() => setScope("filtered")}
                icon={
                  <span className="text-mono-s rounded-chip border border-line-subtle px-1.5 py-0.5 text-ink-secondary">
                    {filtered.length}
                  </span>
                }
                title="Current filters"
                hint={filtersActive ? `${filtered.length} events` : "no filters active"}
              />
              <RadioCard
                selected={scope === "all"}
                onClick={() => setScope("all")}
                icon={
                  <span className="text-mono-s rounded-chip border border-line-subtle px-1.5 py-0.5 text-ink-secondary">
                    {all.length}
                  </span>
                }
                title="Everything loaded"
                hint={`${all.length} events`}
              />
            </div>

            <label className="mt-5 flex cursor-pointer items-center gap-2.5">
              <button
                role="checkbox"
                aria-checked={includeProofs}
                onClick={() => setIncludeProofs((v) => !v)}
                className={cn(
                  "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
                  includeProofs ? "border-spin bg-spin text-[#06231A]" : "border-line-strong",
                )}
              >
                {includeProofs && <Check className="size-3" />}
              </button>
              <span className="text-[13px] text-ink-secondary">
                include chain proofs <span className="text-mono-s text-ink-muted">(recommended)</span>
              </span>
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating || count === 0}
                className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
              >
                {generating && <span className="spin-loader inline-block size-4" />}
                {generating ? "Generating…" : `Generate export · ${count}`}
              </button>
            </div>
            <p className="text-mono-s mt-3 text-center text-ink-muted">
              exports are generated client-side · plaintext is never stored
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
