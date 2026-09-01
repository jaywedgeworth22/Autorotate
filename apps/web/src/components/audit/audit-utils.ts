import type { AuditEntry } from "@contracts/autorotate";

/* ------------------------------------------------------------------ */
/* Severity & color mapping (derived — the record itself is minimal)    */
/* ------------------------------------------------------------------ */

export type Severity = "info" | "notice" | "critical";

export function severityOf(e: AuditEntry): Severity {
  if (e.action === "rotation.failed" || e.action === "rotation.rollback") return "critical";
  if (
    e.action === "rotation.partial" ||
    e.action.startsWith("policy.") ||
    e.action === "target.created" ||
    e.action === "secret.created" ||
    e.action === "secret.updated"
  )
    return "notice";
  return "info";
}

export const SEVERITY_DOT: Record<Severity, string> = {
  info: "bg-ink-muted",
  notice: "bg-warn",
  critical: "bg-danger animate-tick-pulse",
};

/** Chip classes per action family. */
export function actionChipClass(action: string): string {
  if (action === "rotation.committed") return "border-spin-dim bg-spin/10 text-spin";
  if (action === "rotation.failed") return "border-danger/50 bg-danger/10 text-danger";
  if (action === "rotation.partial" || action === "rotation.rollback")
    return "border-warn/50 bg-warn/10 text-warn";
  if (action.startsWith("companion.")) return "border-violet/50 bg-violet/10 text-violet";
  if (action.startsWith("auth.")) return "border-line-strong text-ink-muted";
  return "border-info/40 bg-info/5 text-info";
}

export function actionPrefix(action: string): string {
  return action.split(".")[0] ?? action;
}

/* ------------------------------------------------------------------ */
/* Detail helpers                                                       */
/* ------------------------------------------------------------------ */

export function detailObj(e: AuditEntry): Record<string, unknown> | null {
  const d = e.detailJson as unknown;
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
}

export function runIdOf(e: AuditEntry): number | null {
  const d = detailObj(e);
  const id = d?.runId;
  return typeof id === "number" && id > 0 ? id : null;
}

export function runLabel(id: number): string {
  return `run_${String(id).padStart(6, "0")}`;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 37)}…` : v;
  return JSON.stringify(v);
}

/** Human-readable one-line description of an event. */
export function describeEntry(e: AuditEntry, secretName?: string): string {
  const d = detailObj(e);
  const name = secretName ?? (e.secretId != null ? `secret #${e.secretId}` : null);
  const runBit = d?.runId ? ` · ${runLabel(Number(d.runId))}` : "";

  if (e.action === "rotation.committed")
    return `${name ?? "secret"} rotated · 6/6 steps${d?.trigger ? ` · ${String(d.trigger)}` : ""}${runBit}`;
  if (e.action === "rotation.partial")
    return `${name ?? "secret"} partially rotated — some targets failed${runBit}`;
  if (e.action === "rotation.failed") return `${name ?? "secret"} rotation failed${runBit}`;
  if (e.action === "rotation.rollback") return `${name ?? "secret"} rolled back${runBit}`;
  if (e.action === "policy.updated") {
    const hours = typeof d?.intervalHours === "number" ? d.intervalHours : null;
    return `${name ?? "secret"} policy updated${hours ? ` · interval ${hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`}` : ""}`;
  }
  if (e.action === "connector.created") return `connector ${fmtVal(d?.platform)} registered`;
  if (e.action === "connector.tested") return `connector ${fmtVal(d?.platform)} tested`;
  if (e.action === "secret.created") return `${name ?? "secret"} now tracked`;

  // Generic fallback: action + first few detail pairs.
  if (d) {
    const pairs = Object.entries(d)
      .slice(0, 3)
      .map(([k, v]) => `${k} ${fmtVal(v)}`)
      .join(" · ");
    return pairs ? `${e.action} · ${pairs}` : e.action;
  }
  return e.action;
}

/** Resource label shown in the stream row (run id wins, then secret name). */
export function resourceLabel(e: AuditEntry, secretName?: string): string | null {
  const rid = runIdOf(e);
  if (rid) return runLabel(rid);
  return secretName ?? null;
}

/* ------------------------------------------------------------------ */
/* Day grouping                                                         */
/* ------------------------------------------------------------------ */

export interface DayGroup {
  key: string;
  label: string;
  entries: AuditEntry[];
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function groupByDay(entries: AuditEntry[]): DayGroup[] {
  const groups = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const k = dayKey(new Date(e.ts));
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 24 * 3600 * 1000));
  return [...groups.entries()].map(([key, list]) => {
    const d = new Date(list[0].ts);
    const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    const label = key === today ? `TODAY — ${base}` : key === yesterday ? `YESTERDAY — ${base}` : base;
    return { key, label, entries: list };
  });
}

/* ------------------------------------------------------------------ */
/* Export helpers                                                       */
/* ------------------------------------------------------------------ */

export function toCsv(entries: AuditEntry[], includeProofs: boolean): string {
  const header = includeProofs
    ? "id,ts,actor,action,secretId,prevHash,entryHash,detail"
    : "id,ts,actor,action,secretId,detail";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = entries.map((e) => {
    const base = [
      e.id,
      esc(new Date(e.ts).toISOString()),
      esc(e.actor),
      esc(e.action),
      e.secretId ?? "",
    ];
    if (includeProofs) base.push(esc(e.prevHash), esc(e.entryHash));
    base.push(esc(JSON.stringify(e.detailJson ?? null)));
    return base.join(",");
  });
  return [header, ...rows].join("\n");
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
