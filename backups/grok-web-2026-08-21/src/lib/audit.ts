/** Hash-chained audit — same algorithm as TopSpinCore / apps/web engine. */

export const GENESIS_HASH = "0000000000000000";

export const RUN_STEP_NAMES = [
  "lock",
  "rotate",
  "push",
  "verify",
  "commit",
  "audit",
] as const;

export type RunStepName = (typeof RUN_STEP_NAMES)[number];
export type StepStatus = "ok" | "failed" | "skipped" | "running";
export type RunStatus = "committed" | "partial" | "failed";

export type RotationStep = {
  step: RunStepName;
  status: StepStatus;
  startedAt: string;
  durationMs: number;
  message: string;
  targetKind?: string;
  targetId?: string;
};

export type AuditCanonical = {
  ts: string;
  actor: string;
  action: string;
  secretId: string | null;
  detail: unknown;
};

export type AuditEntry = AuditCanonical & {
  prevHash: string;
  entryHash: string;
};

export type ChainVerification = {
  valid: boolean;
  checked: number;
  brokenAt: string | null;
};

/** Deep key-sorted stringify — immune to JSON key reordering. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function canonicalEntry(entry: AuditCanonical): string {
  return `{"action":${JSON.stringify(entry.action)},"actor":${JSON.stringify(
    entry.actor,
  )},"detail":${stableStringify(entry.detail ?? null)},"secretId":${JSON.stringify(
    entry.secretId,
  )},"ts":${JSON.stringify(entry.ts)}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256 hex prefix (16 chars) — the only trace of a secret value in audit. */
export async function fingerprint(value: string): Promise<string> {
  return (await sha256Hex(value)).slice(0, 16);
}

export async function computeEntryHash(prevHash: string, entry: AuditCanonical): Promise<string> {
  return (await sha256Hex(prevHash + canonicalEntry(entry))).slice(0, 16);
}

export async function appendAuditEntry(
  log: AuditEntry[],
  actor: string,
  action: string,
  secretId: string | null,
  detail: unknown,
  ts = new Date(),
): Promise<{ log: AuditEntry[]; entry: AuditEntry }> {
  const prevHash = log.length ? log[log.length - 1].entryHash : GENESIS_HASH;
  const canonical: AuditCanonical = {
    ts: ts.toISOString(),
    actor,
    action,
    secretId,
    detail: detail ?? null,
  };
  const entry: AuditEntry = {
    ...canonical,
    prevHash,
    entryHash: await computeEntryHash(prevHash, canonical),
  };
  return { log: [...log, entry], entry };
}

export async function verifyAuditChain(log: AuditEntry[]): Promise<ChainVerification> {
  let prevHash = GENESIS_HASH;
  for (const entry of log) {
    const expected = await computeEntryHash(prevHash, {
      ts: entry.ts,
      actor: entry.actor,
      action: entry.action,
      secretId: entry.secretId,
      detail: entry.detail,
    });
    if (entry.prevHash !== prevHash || entry.entryHash !== expected) {
      return { valid: false, checked: log.length, brokenAt: entry.entryHash };
    }
    prevHash = entry.entryHash;
  }
  return { valid: true, checked: log.length, brokenAt: null };
}

export async function recordStep(
  steps: RotationStep[],
  step: RunStepName,
  fn: () => Promise<string>,
  extra?: Pick<RotationStep, "targetKind" | "targetId">,
): Promise<boolean> {
  const startedAt = new Date();
  try {
    const message = await fn();
    steps.push({
      step,
      status: "ok",
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      message,
      ...extra,
    });
    return true;
  } catch (err) {
    steps.push({
      step,
      status: "failed",
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      message: err instanceof Error ? err.message : "failed",
      ...extra,
    });
    return false;
  }
}
