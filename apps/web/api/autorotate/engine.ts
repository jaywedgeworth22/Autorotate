import { eq, desc, and, ne, lte, gt, isNotNull, sql, count } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  secrets,
  targets,
  rotationRuns,
  auditLog,
  type Secret,
  type Target,
  type RotationRun,
} from "@db/schema";
import {
  policySchema,
  DEFAULT_POLICY,
  type RotationStep,
  type RotationPolicy,
  type RunTrigger,
  type ChainVerification,
  type FileTargetConfig,
  type InfisicalTargetConfig,
  type WebhookTargetConfig,
} from "@contracts/autorotate";
import { decryptJson, fingerprint, sha256Hex } from "./crypto";
import { getConnector, probeNewCredential } from "./connectors";
import { isDemoMode, demoMessage, demoLatency } from "./demo";
import { hasInfisicalConfig, upsertSecret, readSecret } from "./infisical";
import { writeFileTarget, readFileTarget } from "./files";
import { safeFetch } from "./netguard";
import { notifyRunOutcome } from "./alerts";

// ── Rotation pipeline (architecture.md §2) ──────────────────────
// LOCK -> ROTATE -> PUSH (per enabled target) -> VERIFY -> COMMIT -> AUDIT.
// Plaintext values exist only in this module's memory during a run.

export class RotationLockedError extends Error {
  constructor(secretId: number) {
    super(`Secret ${secretId} already has a rotation run in progress`);
    this.name = "RotationLockedError";
  }
}

export class SecretNotFoundError extends Error {
  constructor(secretId: number) {
    super(`Secret ${secretId} not found`);
    this.name = "SecretNotFoundError";
  }
}

// In-process lock: a fast-fail for the common same-replica case and the only
// lock a dry-run needs (a dry-run changes no live state).  The authoritative
// lock for a real rotation is an atomic DB claim — see claimRotation (AR-19).
const locks = new Set<number>();

export function isLocked(secretId: number): boolean {
  return locks.has(secretId);
}

/**
 * Atomically claim a secret for rotation across every process sharing the
 * database: `UPDATE secrets SET status='rotating' WHERE id=? AND status<>'rotating'`.
 * Zero affected rows means somebody else holds the claim.
 */
async function claimRotation(secretId: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(secrets)
    .set({ status: "rotating" })
    .where(and(eq(secrets.id, secretId), ne(secrets.status, "rotating")));
  const header = firstRow<{ affectedRows?: number }>(result);
  return Number(header?.affectedRows ?? 0) > 0;
}

function parsePolicy(secret: Secret): RotationPolicy {
  const parsed = policySchema.partial().safeParse(secret.policyJson ?? {});
  return { ...DEFAULT_POLICY, ...(parsed.success ? parsed.data : {}) };
}

/**
 * Infisical key used for both PUSH and VERIFY.
 * The Track Secret wizard defaults `secretName` to "" and treats it as
 * optional, so PUSH already falls back to the secret record name. VERIFY
 * must use the same fallback — using the value fingerprint as a name
 * always misses the just-written key.
 */
export function infisicalSecretName(
  cfg: Pick<InfisicalTargetConfig, "secretName">,
  fallbackName: string,
): string {
  const named = cfg.secretName?.trim();
  return named ? named : fallbackName;
}

/**
 * F4 — how a real vs demo run must treat an Infisical target.
 *
 * "simulate": demo mode only.  "deliver": real mode with complete credentials.
 * "reject": real mode with MISSING credentials — the Track Secret wizard seeds
 * an Infisical target with empty clientId/clientSecret/workspaceId, and the old
 * code let that fall through to a simulated success, so PUSH faked delivery,
 * VERIFY compared nothing, and COMMIT marked the secret healthy.  That defeats
 * the AR-02/AR-06 fail-closed guarantee, so a missing-config target in real
 * mode is now an error, never a simulation.
 */
export function infisicalDeliveryMode(
  cfg: Partial<InfisicalTargetConfig> | null | undefined,
): "simulate" | "deliver" | "reject" {
  if (isDemoMode()) return "simulate";
  return hasInfisicalConfig(cfg) ? "deliver" : "reject";
}

const INFISICAL_NO_CONFIG = (targetId: number): string =>
  `infisical target ${targetId} has no credentials — configure it or disable it`;

// ── Target-config masking for the client (F9) ───────────────────
// secrets.list/get return targets.configJson to the browser.  Those blobs hold
// operator secrets (an Infisical machine-identity clientSecret, a file/webhook
// password or token, custom Authorization headers).  Redact the known-secret
// fields and every header VALUE while keeping display fields (path, key, url,
// environment, secretName, service, account) so the UI still renders.
// (Full encryption-at-rest of target configs is a larger migration — OUT OF
// SCOPE here; see the PR body.)
const MASKED_MARKER = "••••••";
const SECRET_CONFIG_KEYS = new Set(["clientSecret", "password", "token"]);

export function maskTargetConfig(config: unknown): Record<string, unknown> | null {
  if (config === null || config === undefined || typeof config !== "object") {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (SECRET_CONFIG_KEYS.has(key)) {
      // Redact a set value; leave an empty/unset one so the UI shows "not set".
      out[key] = value ? MASKED_MARKER : value;
    } else if (key === "headers" && value && typeof value === "object") {
      const headers = value as Record<string, unknown>;
      out[key] = Object.fromEntries(
        Object.keys(headers).map((name) => [name, MASKED_MARKER]),
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Probe name used by targets.test.  A canary must never land on the live
 * Infisical secret or file key — Autorotate does not keep the old plaintext,
 * so overwriting the production slot is unrecoverable.
 */
export function canaryDeliveryName(liveName: string): string {
  const base = liveName.trim() || "SECRET";
  return /_CANARY$/i.test(base) ? base : `${base}_CANARY`;
}

/**
 * Dry-run / canary simulator must never mint or revoke a provider
 * credential.  Cloudflare PUT /value and Slack auth.rotate invalidate
 * the live token; Infisical source upserts a new value.  PUSH is skipped
 * on dry-run, so a live mint here locks the owner out while the UI says
 * no live state changed.
 */
export function shouldMintProviderCredential(dryRun: boolean): boolean {
  return !dryRun;
}

/**
 * Refusal message, kept in parity with the Swift engine's no-target guard
 * (RotationEngine.swift, commit f13ac35 / PR #17).
 */
export const NO_TARGET_REFUSAL =
  "No enabled target to receive the new value; refusing to rotate.";

/**
 * AR-06 — port of the AutorotateCore guard.
 *
 * A programmatic connector mints (and usually deactivates) the provider
 * credential during ROTATE.  With nowhere to deliver the result, the new
 * plaintext exists only inside this function and is then discarded, while the
 * old credential may already be dead — an unrecoverable outage reported as a
 * healthy commit.  Demo mode refuses too: a simulated rotation with no target
 * proves nothing, and consistency here is worth more than explorability.
 *
 * Dry-run keeps its simulated path — it never mints, so it has nothing to
 * lose.
 */
export function canMintForTargets(enabledTargetCount: number, dryRun: boolean): boolean {
  if (dryRun) return true;
  return enabledTargetCount > 0;
}

// ── Hash-chained audit log ──────────────────────────────────────
// entryHash = sha256(prevHash + canonical(entry)), genesis prevHash = "0"*64.
//
// AR-07: hashes used to be truncated to 16 hex characters — 64 bits, which is
// birthday-collision territory for a tamper-evidence claim.  Entries written
// before this change keep their 16-char form and are still verified (see
// verifyAuditChain); every new entry is the full 64-char sha256.

const GENESIS_HASH = "0".repeat(64);
const LEGACY_GENESIS_HASH = "0".repeat(16);
const LEGACY_HASH_LENGTH = 16;
const AUDIT_LOCK_NAME = "autorotate.audit_append";
const AUDIT_LOCK_TIMEOUT_SECONDS = 5;
const CHAIN_SCAN_BATCH = 1000;

type AuditCanonical = {
  ts: string;
  actor: string;
  action: string;
  secretId: number | null;
  detail: unknown;
};

/** Deep key-sorted stringify — immune to MySQL JSON key reordering. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function canonicalEntry(entry: AuditCanonical): string {
  // Stable key order everywhere — must match verifyAuditChain.
  return `{"action":${JSON.stringify(entry.action)},"actor":${JSON.stringify(
    entry.actor,
  )},"detail":${stableStringify(entry.detail ?? null)},"secretId":${JSON.stringify(
    entry.secretId,
  )},"ts":${JSON.stringify(entry.ts)}}`;
}

/** Full 64-char sha256 hex of prevHash ‖ canonical(entry). */
export function computeEntryHash(prevHash: string, entry: AuditCanonical): string {
  return sha256Hex(prevHash + canonicalEntry(entry));
}

/**
 * Verify one stored entry against its predecessor's stored hash.
 *
 * Legacy tolerance (AR-07): an entry whose stored entryHash is 16 characters
 * was written by the truncating implementation, so it is compared against the
 * recomputed hash sliced to 16.  Its successor chains onto that stored
 * 16-char value verbatim, which is exactly what appendAudit writes, so no
 * special case is needed at the legacy→full boundary.  From the first
 * full-width entry onward the comparison is exact.
 */
export function verifyChainLink(
  entry: { prevHash: string; entryHash: string },
  canonical: AuditCanonical,
  previousStoredHash: string | null,
): boolean {
  const legacy = entry.entryHash.length === LEGACY_HASH_LENGTH;
  const prev = previousStoredHash ?? (legacy ? LEGACY_GENESIS_HASH : GENESIS_HASH);
  if (entry.prevHash !== prev) return false;
  const full = computeEntryHash(prev, canonical);
  const expected = legacy ? full.slice(0, LEGACY_HASH_LENGTH) : full;
  return entry.entryHash === expected;
}

/** Extract the first row of a drizzle `execute` result across driver shapes. */
function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) {
    const head = result[0];
    if (Array.isArray(head)) return head[0] as T | undefined;
    return head as T | undefined;
  }
  const rows = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(rows) ? (rows[0] as T | undefined) : undefined;
}

/**
 * Append one hash-chained audit entry.
 *
 * AR-07: read-last and insert are serialized by a MySQL named lock, which is
 * held on the server rather than in this process — so it serializes across
 * replicas and across the scheduler tick that runs concurrently with web
 * actions.  Two appends taking the same predecessor break the chain
 * permanently, because invariant 2 correctly forbids rewriting history to
 * repair it.
 *
 * Deployment note: GET_LOCK is a MySQL server function.  It exists on MySQL,
 * MariaDB and TiDB >= 6.2; a Vitess-fronted deployment must confirm it is
 * routed before relying on this.
 *
 * F5: GET_LOCK is SESSION-scoped, but the drizzle mysql2 client is a POOL that
 * hands each statement a possibly-different connection — so taking the lock on
 * one statement and reading/inserting on others protected nothing.  The whole
 * critical section now runs inside db.transaction, which pins ONE connection
 * for every statement, so the named lock actually serializes the read-last +
 * insert.  RELEASE_LOCK runs in a finally (before COMMIT) so a throwing insert
 * still frees it.
 */
export async function appendAudit(
  actor: string,
  action: string,
  secretId: number | null,
  detail: unknown,
  ts: Date = new Date(),
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const acquired = firstRow<{ acquired: number | null }>(
      await tx.execute(
        sql`SELECT GET_LOCK(${AUDIT_LOCK_NAME}, ${AUDIT_LOCK_TIMEOUT_SECONDS}) AS acquired`,
      ),
    );
    if (Number(acquired?.acquired) !== 1) {
      throw new Error(
        `audit append lock not acquired within ${AUDIT_LOCK_TIMEOUT_SECONDS}s — refusing to append out of order`,
      );
    }
    try {
      const [last] = await tx
        .select({ entryHash: auditLog.entryHash })
        .from(auditLog)
        .orderBy(desc(auditLog.id))
        .limit(1);
      const prevHash = last?.entryHash ?? GENESIS_HASH;
      const canonical: AuditCanonical = {
        ts: ts.toISOString(),
        actor,
        action,
        secretId,
        detail: detail ?? null,
      };
      await tx.insert(auditLog).values({
        ts,
        actor,
        action,
        secretId,
        detailJson: (detail ?? null) as never,
        prevHash,
        entryHash: computeEntryHash(prevHash, canonical),
      });
    } finally {
      await tx.execute(sql`SELECT RELEASE_LOCK(${AUDIT_LOCK_NAME})`);
    }
  });
}

/**
 * Walk the chain in id-ordered batches.  The audit log is append-only and
 * unbounded, so loading it whole to answer one endpoint was a DoS path of its
 * own (AR-07/AR-21).
 */
export async function verifyAuditChain(): Promise<ChainVerification> {
  const db = getDb();
  let previousStoredHash: string | null = null;
  let checked = 0;
  let lastId = 0;
  for (;;) {
    const entries = await db
      .select()
      .from(auditLog)
      .where(gt(auditLog.id, lastId))
      .orderBy(auditLog.id)
      .limit(CHAIN_SCAN_BATCH);
    if (entries.length === 0) break;
    for (const entry of entries) {
      const canonical: AuditCanonical = {
        ts: entry.ts.toISOString(),
        actor: entry.actor,
        action: entry.action,
        secretId: entry.secretId ?? null,
        detail: entry.detailJson ?? null,
      };
      checked++;
      if (!verifyChainLink(entry, canonical, previousStoredHash)) {
        return { valid: false, checked, brokenAtId: entry.id };
      }
      previousStoredHash = entry.entryHash;
      lastId = entry.id;
    }
    if (entries.length < CHAIN_SCAN_BATCH) break;
  }
  return { valid: true, checked, brokenAtId: null };
}

// ── Target delivery ─────────────────────────────────────────────

const WEBHOOK_TIMEOUT_MS = 10_000;

async function pushToTarget(
  target: Target,
  secret: Secret,
  value: string,
): Promise<string> {
  const cfg = (target.configJson ?? {}) as Record<string, unknown>;
  switch (target.kind) {
    case "infisical": {
      const icfg = cfg as InfisicalTargetConfig;
      const secretName = infisicalSecretName(icfg, secret.name);
      const mode = infisicalDeliveryMode(icfg);
      if (mode === "reject") {
        // F4: real mode with no credentials must throw, never simulate.
        throw new Error(INFISICAL_NO_CONFIG(target.id));
      }
      if (mode === "deliver") {
        await upsertSecret(icfg, secretName, value);
        return `upserted ${secretName} to Infisical (${icfg.environment || "prod"}:${icfg.secretPath || "/"})`;
      }
      // simulate (demo mode only)
      const ms = await demoLatency();
      return demoMessage(
        `upserted ${secretName} to Infisical ${icfg.environment || "prod"}:${icfg.secretPath || "/"} (simulated, ${ms}ms)`,
      );
    }
    case "file": {
      const fcfg = cfg as unknown as FileTargetConfig;
      // AR-03: file targets used to "always execute for real", which let a
      // demo-mode deployment overwrite a production .env with a generated
      // value.  Demo mode now simulates every target kind.
      if (isDemoMode()) {
        const ms = await demoLatency();
        return demoMessage(
          `wrote ${fcfg.key} to ${fcfg.path} (${fcfg.format}) (simulated, ${ms}ms)`,
        );
      }
      await writeFileTarget(fcfg, value);
      return `wrote ${fcfg.key} to ${fcfg.path} (${fcfg.format})`;
    }
    case "webhook": {
      const wcfg = cfg as unknown as WebhookTargetConfig;
      if (!isDemoMode() && wcfg.url) {
        // AR-09 / F1: https-only, no loopback/link-local/RFC1918 destinations,
        // and no following a 3xx redirect to an internal host.
        const res = await safeFetch(wcfg.url, {
          method: wcfg.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(wcfg.headers ?? {}),
          },
          body: JSON.stringify({
            name: secret.name,
            valueRef: `autorotate://secrets/${secret.id}/v${secret.version + 1}`,
            ...(wcfg.includeValue ? { value } : {}),
          }),
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        if (!res.ok) {
          throw new Error(`webhook ${wcfg.url} returned HTTP ${res.status}`);
        }
        return `POSTed rotation notice to ${wcfg.url}`;
      }
      const ms = await demoLatency();
      return demoMessage(
        `POSTed rotation notice to ${wcfg.url ?? "(unconfigured)"} (simulated, ${ms}ms)`,
      );
    }
    case "keychain": {
      const kcfg = cfg as { service?: string; account?: string };
      // On web, Keychain writes are handled by the native companion app.  This
      // is an INTENTIONAL delegation (a documented no-op on the web side), not
      // a simulated success like the F4 demo path — there is no live web
      // Keychain to write to, and the companion app owns delivery.
      return `delegated to companion app (keychain item ${kcfg.service ?? "?"}/${kcfg.account ?? secret.name})`;
    }
  }
}

async function verifyTarget(
  target: Target,
  expectedValue: string,
  secret: Secret,
): Promise<string> {
  const cfg = (target.configJson ?? {}) as Record<string, unknown>;
  const expectedFp = fingerprint(expectedValue);
  switch (target.kind) {
    case "infisical": {
      const icfg = cfg as InfisicalTargetConfig;
      const mode = infisicalDeliveryMode(icfg);
      if (mode === "reject") {
        // F4: never claim a read-back verified a target we cannot reach.
        throw new Error(INFISICAL_NO_CONFIG(target.id));
      }
      if (mode === "deliver") {
        const read = await readSecret(icfg, infisicalSecretName(icfg, secret.name));
        if (read === null || fingerprint(read) !== expectedFp) {
          throw new Error("Infisical read-back fingerprint mismatch");
        }
        return "read-back verified against Infisical";
      }
      // simulate (demo mode only)
      await demoLatency();
      return demoMessage("read-back verified against Infisical (simulated)");
    }
    case "file": {
      const fcfg = cfg as unknown as FileTargetConfig;
      // Demo mode never wrote the file, so it must not claim to read it back.
      if (isDemoMode()) {
        await demoLatency();
        return demoMessage(`read-back verified ${fcfg.path} (simulated)`);
      }
      const read = await readFileTarget(fcfg);
      if (read === null || fingerprint(read) !== expectedFp) {
        throw new Error(`file read-back mismatch at ${fcfg.path}`);
      }
      return `read-back verified ${fcfg.path}`;
    }
    case "webhook":
      return "no read-back available for webhook targets";
    case "keychain":
      return "read-back delegated to companion app";
  }
}

// ── Main entry ──────────────────────────────────────────────────

export async function rotateSecret(
  secretId: number,
  trigger: RunTrigger,
  actor = "system",
  dryRun = false,
): Promise<RotationRun> {
  const db = getDb();
  const secret = await db.query.secrets.findFirst({
    where: eq(secrets.id, secretId),
  });
  if (!secret) throw new SecretNotFoundError(secretId);
  if (locks.has(secretId)) throw new RotationLockedError(secretId);
  locks.add(secretId);

  const steps: RotationStep[] = [];
  const record = async (
    step: RotationStep["step"],
    fn: () => Promise<string>,
    extra?: Pick<RotationStep, "targetKind" | "targetId">,
  ): Promise<boolean> => {
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
        message: (err as Error).message,
        ...extra,
      });
      return false;
    }
  };

  let claimed = false;
  let runId: number | undefined;
  let runStatus: "committed" | "partial" | "failed" = "failed";
  let runError: string | null = null;
  let newFp: string | null = null;

  try {
    // AR-19 / F7: claim the secret in the database before any live work, so two
    // replicas cannot rotate the same credential concurrently (the claim also
    // writes the "rotating" status the UI reads).  The claim, the run-row
    // insert, and the whole pipeline are INSIDE this try, so its finally always
    // releases both the in-memory lock and the DB "rotating" claim — a throw
    // between the claim and the pipeline (e.g. the run insert) can no longer
    // leave the secret stuck "rotating" with the in-process lock held forever.
    if (!dryRun) {
      claimed = await claimRotation(secretId);
      if (!claimed) throw new RotationLockedError(secretId);
    }

    const [runRow] = await db
      .insert(rotationRuns)
      .values({
        secretId,
        trigger,
        status: "running",
        startedAt: new Date(),
        stepsJson: [] as never,
      })
      .$returningId();
    runId = runRow.id;

    // 1. LOCK
    await record("lock", async () =>
      dryRun ? "acquired in-process rotation lock (dry-run simulator)" : "acquired in-process rotation lock",
    );

    // 2. ROTATE
    const connectorRow = await db.query.connectors.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, secret.connectorId),
    });
    const connector = connectorRow
      ? getConnector(connectorRow.platform)
      : undefined;

    // Targets are loaded BEFORE the mint so the no-target guard can refuse
    // without any provider call having happened (AR-06).
    const targetRows = await db
      .select()
      .from(targets)
      .where(eq(targets.secretId, secretId));
    const enabledTargets = targetRows.filter((t) => t.enabled);

    let newValue: string | null = null;
    const rotateOk = await record("rotate", async () => {
      if (!canMintForTargets(enabledTargets.length, dryRun)) {
        throw new Error(
          `${NO_TARGET_REFUSAL}  A programmatic mint revokes the old credential and discards the new one when there is nowhere to deliver it.`,
        );
      }
      if (!connectorRow || !connector) {
        throw new Error(
          `no connector registered for platform "${connectorRow?.platform ?? "?"}"`,
        );
      }
      if (!shouldMintProviderCredential(dryRun)) {
        // Keep the rest of the dry-run path (simulated PUSH/VERIFY) without
        // calling a live rotate(). Placeholder never leaves this process.
        newValue = "__topspin_dry_run_not_minted__";
        return "[dry-run] skipped live mint — no provider credential created or revoked";
      }
      const config = decryptJson(connectorRow.configEnc);
      const result = await connector.rotate(config);
      if (!result.value) throw new Error("connector returned no value");
      newValue = result.value;
      return result.demo ? demoMessage(result.message) : result.message;
    });

    if (rotateOk && newValue) {
      const value: string = newValue;
      if (!dryRun) {
        newFp = fingerprint(value);
      }

      // 3. PUSH — every enabled target
      if (enabledTargets.length === 0) {
        await record("push", async () => "no enabled targets — nothing to deliver");
      }

      const pushedTargets: Target[] = [];
      let pushFailures = 0;
      for (const target of enabledTargets) {
        const ok = await record(
          "push",
          async () => {
            if (dryRun) {
              return `[dry-run] simulated delivery to ${target.kind} target #${target.id} (verified)`;
            }
            return pushToTarget(target, secret, value);
          },
          { targetKind: target.kind, targetId: target.id },
        );
        if (!dryRun) {
          await db
            .update(targets)
            .set({
              lastStatus: ok ? "ok" : "failed",
              lastDeliveredAt: ok ? new Date() : target.lastDeliveredAt,
            })
            .where(eq(targets.id, target.id));
        }
        if (ok) pushedTargets.push(target);
        else pushFailures++;
      }

      // 4. VERIFY — optional read-back per successfully pushed target
      const policy = parsePolicy(secret);
      let verifyFailures = 0;
      if (policy.verifyAfterWrite && pushedTargets.length > 0) {
        for (const target of pushedTargets) {
          const ok = await record(
            "verify",
            async () => {
              if (dryRun) {
                return `[dry-run] simulated read-back verified against ${target.kind}`;
              }
              return verifyTarget(target, value, secret);
            },
            {
              targetKind: target.kind,
              targetId: target.id,
            },
          );
          if (!ok) {
            verifyFailures++;
            if (!dryRun) {
              await db
                .update(targets)
                .set({ lastStatus: "failed" })
                .where(eq(targets.id, target.id));
            }
          }
        }
      } else {
        await record(
          "verify",
          async () => "skipped (verifyAfterWrite disabled or no pushed targets)",
        );
      }

      // 5. LIVENESS GATE (F6 / AR-11) — prove the NEW credential actually
      // authenticates, BEFORE the COMMIT DB writes.  VERIFY only reads back
      // what PUSH just wrote and compares it to itself, so a dead or fabricated
      // credential passes it.  Running the probe as a gate here (rather than
      // after COMMIT) removes the window in which the secret was already
      // "healthy" while the probe ran — a window in which a concurrent replica
      // could legitimately re-claim it, only for this run's finally to reset
      // that other claim to "failed" — and keeps the audit version honest.
      const totalFailures = pushFailures + verifyFailures;
      const deliveredOk =
        totalFailures === 0 &&
        (enabledTargets.length === 0 || pushedTargets.length > 0);

      let livenessOk = true;
      if (!dryRun) {
        if (deliveredOk) {
          const platform = connectorRow?.platform ?? "";
          livenessOk = await record("liveness", async () => {
            if (isDemoMode()) {
              await demoLatency();
              return demoMessage("new credential authenticated against the provider (simulated)");
            }
            let probe: string | null;
            try {
              probe = await probeNewCredential(platform, value);
            } catch (err) {
              throw new Error(
                `credential delivered but failed liveness probe: ${(err as Error).message}.  The previous credential was already revoked during ROTATE, so this cannot be rolled back — reconnect the platform and rotate again.`,
              );
            }
            return (
              probe ??
              `no liveness probe available for ${platform || "this platform"} — delivery verified by read-back only`
            );
          });
        } else {
          await record(
            "liveness",
            async () => "skipped — delivery incomplete, credential not committed",
          );
        }
      }

      // 6. COMMIT
      const committed = deliveredOk && (dryRun || livenessOk);
      runStatus = committed
        ? "committed"
        : pushedTargets.length > 0
          ? "partial"
          : "failed";
      await record("commit", async () => {
        if (!deliveredOk && pushedTargets.length === 0) {
          throw new Error("all target deliveries failed — old value retained");
        }
        if (dryRun) {
          return `[dry-run] simulation complete: all ${pushedTargets.length} target(s) passed validation (no live state changed)`;
        }
        const now = new Date();
        const nextDue = new Date(now.getTime() + policy.intervalHours * 3600 * 1000);
        if (committed) {
          await db
            .update(secrets)
            .set({
              status: "healthy",
              version: secret.version + 1,
              lastRotatedAt: now,
              nextDueAt: nextDue,
              fingerprint: newFp,
            })
            .where(eq(secrets.id, secretId));
          return `committed version ${secret.version + 1}; next rotation due ${nextDue.toISOString()}`;
        }
        // Partial: some targets took the new value, or the liveness probe
        // failed.  Do NOT advance to a healthy-committed version (F6) — keep the
        // old version and flag the secret for retry.  DO advance nextDueAt by
        // the policy interval (F13): leaving it in the past makes the scheduler
        // re-mint every tick, burning provider credentials.  The old plaintext
        // was already discarded during ROTATE, so there is nothing to roll back.
        await db
          .update(secrets)
          .set({ status: "failed", fingerprint: newFp, nextDueAt: nextDue })
          .where(eq(secrets.id, secretId));
        const why = !livenessOk
          ? "liveness probe failed"
          : `${pushedTargets.length}/${enabledTargets.length} targets updated`;
        return `partial commit (${why}) — old plaintext already discarded during ROTATE, cannot roll back; flagged for retry`;
      });
      if (runStatus === "partial") {
        runError = !livenessOk
          ? "credential delivered but failed liveness probe"
          : steps.find((s) => s.status === "failed")?.message ?? "partial delivery";
      } else if (runStatus === "failed" && !dryRun) {
        runError = steps.find((s) => s.status === "failed")?.message ?? null;
        await db
          .update(secrets)
          .set({ status: "failed" })
          .where(eq(secrets.id, secretId));
      }
    } else {
      runStatus = "failed";
      runError = steps.find((s) => s.status === "failed")?.message ?? "rotate step failed";
      await record("push", async () => {
        throw new Error("skipped — rotation produced no value");
      });
      await record("commit", async () => {
        throw new Error("skipped — nothing to commit");
      });
      if (!dryRun) {
        await db
          .update(secrets)
          .set({ status: "failed" })
          .where(eq(secrets.id, secretId));
      }
    }

    // 7. AUDIT — hash-chained, fingerprints only, never values
    await record("audit", async () => {
      await appendAudit(
        actor,
        dryRun
          ? "rotation.dry_run"
          : runStatus === "committed"
            ? "rotation.committed"
            : runStatus === "partial"
              ? "rotation.partial"
              : "rotation.failed",
        secretId,
        {
          runId,
          trigger,
          dryRun,
          status: runStatus,
          version: runStatus === "committed" && !dryRun ? secret.version + 1 : secret.version,
          fingerprint: newFp,
          failedSteps: steps
            .filter((s) => s.status === "failed")
            .map((s) => s.step),
        },
      );
      return "audit entry appended (hash-chained)";
    });
  } finally {
    locks.delete(secretId);
    if (!dryRun && claimed) {
      // Release the DB claim: only the holder may clear a stuck "rotating".
      // Any other row in that state belongs to a concurrent run.
      await db
        .update(secrets)
        .set({ status: "failed" })
        .where(and(eq(secrets.id, secretId), eq(secrets.status, "rotating")));
    }
    // runId is undefined only when the claim or the run-row insert threw before
    // a run existed; there is nothing to finalize in that case (F7).
    if (runId !== undefined) {
      await db
        .update(rotationRuns)
        .set({
          status: runStatus,
          finishedAt: new Date(),
          stepsJson: steps as never,
          newFingerprint: newFp,
          error: runError,
        })
        .where(eq(rotationRuns.id, runId));

      if (!dryRun) {
        // AR-16: fire-and-forget; notifyRunOutcome never throws and never
        // carries a value or fingerprint.
        void notifyRunOutcome({ runId, secretName: secret.name, status: runStatus });
      }
    }
  }

  const run = await db.query.rotationRuns.findFirst({
    where: eq(rotationRuns.id, runId!),
  });
  return run!;
}

// ── Due-status maintenance ──────────────────────────────────────

const DUE_SOON_WINDOW_MS = 24 * 3600 * 1000;

/** Recompute due_soon/overdue/healthy from nextDueAt for non-exempt secrets. */
export async function refreshDueStatuses(now = new Date()): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      id: secrets.id,
      status: secrets.status,
      nextDueAt: secrets.nextDueAt,
    })
    .from(secrets)
    .where(
      and(
        ne(secrets.status, "rotating"),
        ne(secrets.status, "paused"),
        ne(secrets.status, "failed"),
      ),
    );
  for (const row of rows) {
    let next: "healthy" | "due_soon" | "overdue" = "healthy";
    if (row.nextDueAt) {
      const diff = row.nextDueAt.getTime() - now.getTime();
      if (diff < 0) next = "overdue";
      else if (diff < DUE_SOON_WINDOW_MS) next = "due_soon";
    }
    if (next !== row.status) {
      await db
        .update(secrets)
        .set({ status: next })
        .where(eq(secrets.id, row.id));
    }
  }
}

/** How many secrets are currently past their rotation deadline (AR-16). */
export async function countOverdueSecrets(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(secrets)
    .where(eq(secrets.status, "overdue"));
  return Number(row?.value ?? 0);
}

/** Secrets due for scheduled rotation right now. */
export async function findDueSecrets(now = new Date()): Promise<Secret[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(secrets)
    .where(and(isNotNull(secrets.nextDueAt), lte(secrets.nextDueAt, now)));
  return rows.filter((row) => {
    if (row.status === "rotating" || row.status === "paused") return false;
    const policy = parsePolicy(row);
    return policy.autoRotate;
  });
}

// ── Drift checking & verification ───────────────────────────────

export async function checkSecretDrift(secretId: number): Promise<{
  secretId: number;
  secretName: string;
  hasDrift: boolean;
  targets: Array<{
    targetId: number;
    kind: "infisical" | "file" | "webhook" | "keychain";
    status: "in_sync" | "drifted" | "error" | "unsupported";
    detail: string;
    expectedFingerprint: string | null;
    actualFingerprint: string | null;
  }>;
}> {
  const db = getDb();
  const secret = await db.query.secrets.findFirst({
    where: eq(secrets.id, secretId),
    with: { targets: true },
  });
  if (!secret) throw new SecretNotFoundError(secretId);

  const targetResults: Array<{
    targetId: number;
    kind: "infisical" | "file" | "webhook" | "keychain";
    status: "in_sync" | "drifted" | "error" | "unsupported";
    detail: string;
    expectedFingerprint: string | null;
    actualFingerprint: string | null;
  }> = [];
  let hasDrift = false;

  for (const target of secret.targets) {
    if (!target.enabled) continue;
    const cfg = (target.configJson ?? {}) as Record<string, unknown>;
    try {
      if (target.kind === "infisical") {
        const icfg = cfg as InfisicalTargetConfig;
        const mode = infisicalDeliveryMode(icfg);
        if (mode === "reject") {
          // F4: a missing-config target in real mode is an error, not "in sync".
          // Reporting sync here would hide the same fail-open PUSH/VERIFY does.
          targetResults.push({
            targetId: target.id,
            kind: target.kind,
            status: "error",
            detail: INFISICAL_NO_CONFIG(target.id),
            expectedFingerprint: secret.fingerprint,
            actualFingerprint: null,
          });
        } else if (mode === "deliver") {
          const val = await readSecret(icfg, infisicalSecretName(icfg, secret.name));
          if (val === null) {
            hasDrift = true;
            targetResults.push({
              targetId: target.id,
              kind: target.kind,
              status: "drifted",
              detail: "Secret not found in Infisical workspace",
              expectedFingerprint: secret.fingerprint,
              actualFingerprint: null,
            });
          } else {
            const actualFp = fingerprint(val);
            const isMatch = actualFp === secret.fingerprint;
            if (!isMatch) hasDrift = true;
            targetResults.push({
              targetId: target.id,
              kind: target.kind,
              status: isMatch ? "in_sync" : "drifted",
              detail: isMatch ? "In sync with Infisical workspace" : "Fingerprint mismatch in Infisical",
              expectedFingerprint: secret.fingerprint,
              actualFingerprint: actualFp,
            });
          }
        } else {
          // Demo mode only.
          targetResults.push({
            targetId: target.id,
            kind: target.kind,
            status: "in_sync",
            detail: "Infisical workspace target verified (simulated)",
            expectedFingerprint: secret.fingerprint,
            actualFingerprint: secret.fingerprint,
          });
        }
      } else if (target.kind === "file") {
        const fcfg = cfg as unknown as FileTargetConfig;
        if (isDemoMode()) {
          // Demo mode never wrote this file — report the simulation, not a
          // reading of somebody's real .env.
          targetResults.push({
            targetId: target.id,
            kind: target.kind,
            status: "in_sync",
            detail: demoMessage(`file target ${fcfg.path} verified (simulated)`),
            expectedFingerprint: secret.fingerprint,
            actualFingerprint: secret.fingerprint,
          });
          continue;
        }
        const val = await readFileTarget(fcfg);
        if (val === null) {
          hasDrift = true;
          targetResults.push({
            targetId: target.id,
            kind: target.kind,
            status: "drifted",
            detail: `File or key not found at ${fcfg.path}`,
            expectedFingerprint: secret.fingerprint,
            actualFingerprint: null,
          });
        } else {
          const actualFp = fingerprint(val);
          const isMatch = actualFp === secret.fingerprint;
          if (!isMatch) hasDrift = true;
          targetResults.push({
            targetId: target.id,
            kind: target.kind,
            status: isMatch ? "in_sync" : "drifted",
            detail: isMatch ? `In sync with ${fcfg.path}` : `File content changed at ${fcfg.path}`,
            expectedFingerprint: secret.fingerprint,
            actualFingerprint: actualFp,
          });
        }
      } else {
        targetResults.push({
          targetId: target.id,
          kind: target.kind,
          status: "unsupported",
          detail: `${target.kind} targets do not support read-back verification`,
          expectedFingerprint: secret.fingerprint,
          actualFingerprint: null,
        });
      }
    } catch (err) {
      targetResults.push({
        targetId: target.id,
        kind: target.kind,
        status: "error",
        detail: (err as Error).message,
        expectedFingerprint: secret.fingerprint,
        actualFingerprint: null,
      });
    }
  }

  return {
    secretId: secret.id,
    secretName: secret.name,
    hasDrift,
    targets: targetResults,
  };
}

