import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { workspaceSettings } from "@db/schema";
import {
  workspaceAlertConfigSchema,
  type MaskedWorkspaceAlertConfig,
  type WorkspaceAlertConfig,
  type WorkspaceAlertUpdateInput,
} from "@contracts/autorotate";
import { assertSafeWebhookUrl } from "./netguard";

// ── Workspace alerts (AR-16) ────────────────────────────────────
// Alert configuration used to live in a module-level object that no replica
// shared, no restart survived, and the rotation engine never read — so no
// alert had ever fired outside the Test button.  It now lives in a single
// workspaceSettings row and rotateSecret calls notifyRunOutcome on every
// completed non-dry run.
//
// Payloads carry the secret NAME, run status, run id and a timestamp.  Never
// a value, never a fingerprint: an alert webhook is a third-party endpoint
// and fingerprints are the one trace of plaintext this product keeps.

export const DEFAULT_ALERT_CONFIG: WorkspaceAlertConfig = {
  slackWebhookUrl: "",
  discordWebhookUrl: "",
  notifyOnFailure: true,
  notifyOnPartial: true,
  notifyOnOverdue: true,
};

const ALERT_TIMEOUT_MS = 10_000;

export async function readAlertConfig(): Promise<WorkspaceAlertConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .orderBy(desc(workspaceSettings.id))
    .limit(1);
  const parsed = workspaceAlertConfigSchema.safeParse(row?.alertsJson ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_ALERT_CONFIG };
}

export async function writeAlertConfig(
  patch: WorkspaceAlertUpdateInput,
): Promise<WorkspaceAlertConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .orderBy(desc(workspaceSettings.id))
    .limit(1);
  const current = workspaceAlertConfigSchema.safeParse(row?.alertsJson ?? {});
  const next: WorkspaceAlertConfig = {
    ...(current.success ? current.data : DEFAULT_ALERT_CONFIG),
    ...patch,
  };
  if (row) {
    await db
      .update(workspaceSettings)
      .set({ alertsJson: next as never, updatedAt: new Date() })
      .where(eq(workspaceSettings.id, row.id));
  } else {
    await db
      .insert(workspaceSettings)
      .values({ alertsJson: next as never, updatedAt: new Date() });
  }
  return next;
}

/** scheme + host + "/…" + the last 4 characters, or null when unset. */
export function maskWebhookUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const tail = raw.slice(-4);
  return `${url.protocol}//${url.host}/…${tail}`;
}

export function maskAlertConfig(config: WorkspaceAlertConfig): MaskedWorkspaceAlertConfig {
  return {
    hasSlack: !!config.slackWebhookUrl,
    hasDiscord: !!config.discordWebhookUrl,
    slackWebhookMasked: maskWebhookUrl(config.slackWebhookUrl),
    discordWebhookMasked: maskWebhookUrl(config.discordWebhookUrl),
    notifyOnFailure: config.notifyOnFailure,
    notifyOnPartial: config.notifyOnPartial,
    notifyOnOverdue: config.notifyOnOverdue,
  };
}

/** POST one alert message, SSRF-guarded and time-boxed. */
export async function postAlert(
  service: "slack" | "discord",
  url: string,
  text: string,
): Promise<void> {
  const safe = await assertSafeWebhookUrl(url);
  const payload = service === "slack" ? { text } : { content: text };
  const res = await fetch(safe, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${service} webhook returned HTTP ${res.status}`);
}

export type RunOutcomeAlert = {
  runId: number;
  secretName: string;
  status: "committed" | "partial" | "failed";
  at?: Date;
};

/** Message text for a completed run — name, status, run id, time.  Nothing else. */
export function runOutcomeMessage(alert: RunOutcomeAlert): string {
  const at = (alert.at ?? new Date()).toISOString();
  const headline =
    alert.status === "failed"
      ? "Rotation failed"
      : "Rotation partially delivered";
  return `[Autorotate] ${headline}: ${alert.secretName} — run #${alert.runId} at ${at}`;
}

function shouldNotify(config: WorkspaceAlertConfig, status: RunOutcomeAlert["status"]): boolean {
  if (status === "failed") return config.notifyOnFailure;
  if (status === "partial") return config.notifyOnPartial;
  return false;
}

/**
 * Fire-and-forget notification for a completed rotation run.  Never throws:
 * a dead alert webhook must not turn a successful rotation into a failed one.
 */
export async function notifyRunOutcome(alert: RunOutcomeAlert): Promise<void> {
  try {
    const config = await readAlertConfig();
    if (!shouldNotify(config, alert.status)) return;
    const text = runOutcomeMessage(alert);
    await deliver(config, text);
  } catch (err) {
    console.error("[autorotate alerts] run outcome notification failed:", (err as Error).message);
  }
}

async function deliver(config: WorkspaceAlertConfig, text: string): Promise<void> {
  const sends: Promise<void>[] = [];
  if (config.slackWebhookUrl) sends.push(postAlert("slack", config.slackWebhookUrl, text));
  if (config.discordWebhookUrl) sends.push(postAlert("discord", config.discordWebhookUrl, text));
  const results = await Promise.allSettled(sends);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        "[autorotate alerts] delivery failed:",
        (result.reason as Error)?.message ?? String(result.reason),
      );
    }
  }
}

// ── Overdue digest ──────────────────────────────────────────────
// One summary per process per 6h.  Module-level state, so a multi-replica
// deployment sends at most one digest per replica per window — acceptable for
// a nag, and the honest alternative (a shared store) is not worth a table.

export const OVERDUE_NOTIFY_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastOverdueNotifyAt = 0;

export function shouldSendOverdueDigest(
  overdueCount: number,
  now: number = Date.now(),
): boolean {
  if (overdueCount <= 0) return false;
  return now - lastOverdueNotifyAt >= OVERDUE_NOTIFY_INTERVAL_MS;
}

export function resetOverdueDigestThrottle(): void {
  lastOverdueNotifyAt = 0;
}

export async function notifyOverdue(
  overdueCount: number,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (!shouldSendOverdueDigest(overdueCount, now.getTime())) return;
    const config = await readAlertConfig();
    if (!config.notifyOnOverdue) return;
    if (!config.slackWebhookUrl && !config.discordWebhookUrl) return;
    lastOverdueNotifyAt = now.getTime();
    await deliver(
      config,
      `[Autorotate] ${overdueCount} secret(s) are past their rotation deadline as of ${now.toISOString()}`,
    );
  } catch (err) {
    console.error("[autorotate alerts] overdue digest failed:", (err as Error).message);
  }
}
