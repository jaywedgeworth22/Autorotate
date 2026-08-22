import { promises as fs } from "node:fs";
import path from "node:path";
import { getDb } from "../api/queries/connection";
import {
  connectors,
  secrets,
  targets,
  rotationRuns,
  auditLog,
} from "./schema";
import { connectorRegistry } from "../api/topspin/connectors";
import { encryptJson, randomToken } from "../api/topspin/crypto";
import { computeEntryHash } from "../api/topspin/engine";
import { fileRoot } from "../api/topspin/files";
import type { RotationPolicy, RotationStep } from "@contracts/topspin";

// Idempotent rich demo seed for TopSpin. Safe to re-run: it exits early when
// connectors already exist. No plaintext real secrets — only fingerprints and
// randomly generated demo placeholders.

const rand = (min: number, max: number) =>
  Math.round(min + Math.random() * (max - min));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const hex16 = () => randomToken(16, "0123456789abcdef");

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

// ── Demo file targets (real files under TOPSPIN_FILE_ROOT) ──────

const DEMO_FILES: Record<string, string> = {
  "demo-app/.env": [
    "# demo-app environment — managed by TopSpin",
    "DATABASE_URL=mysql://demo:demo@localhost:3306/demoapp",
    "OPENAI_API_KEY=sk-proj-REPLACE_ME",
    "STRIPE_SECRET_KEY=sk_live_REPLACE_ME",
    "SENDGRID_API_KEY=SG.REPLACE_ME",
    "",
  ].join("\n"),
  "deploy/config.json":
    JSON.stringify(
      {
        service: "topspin-demo",
        replicas: 2,
        credentials: {
          npmToken: "npm_REPLACE_ME",
          dockerHubToken: "dckr_pat_REPLACE_ME",
        },
        githubToken: "ghp_REPLACE_ME",
      },
      null,
      2,
    ) + "\n",
  "ci/pipeline.yaml": [
    "# CI pipeline secrets — managed by TopSpin",
    "aws_access_key_id: AKIA_REPLACE_ME",
    "cloudflare_api_token: cf_REPLACE_ME",
    "slack_bot_token: xoxb-REPLACE_ME",
    "",
  ].join("\n"),
  "aws/credentials": [
    "[default]",
    "aws_access_key_id = AKIA_REPLACE_ME",
    "aws_secret_access_key = demo_replace_me",
    "",
    "[prod]",
    "aws_access_key_id = AKIA_REPLACE_ME_PROD",
    "aws_secret_access_key = demo_replace_me_prod",
    "",
  ].join("\n"),
};

async function writeDemoFiles(): Promise<void> {
  const root = fileRoot();
  for (const [rel, content] of Object.entries(DEMO_FILES)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }
  console.log(`Demo files written under ${root}`);
}

// ── Secret name templates per platform ──────────────────────────

const SECRET_NAMES: Record<string, string[]> = {
  infisical: ["INFISICAL_SERVICE_TOKEN", "INFISICAL_CLIENT_SECRET"],
  aws_iam: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  github: ["GITHUB_TOKEN", "GITHUB_OAUTH_CLIENT_SECRET"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_RESTRICTED_KEY"],
  openai: ["OPENAI_API_KEY", "OPENAI_SERVICE_ACCOUNT_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  cloudflare: ["CLOUDFLARE_API_TOKEN"],
  vercel: ["VERCEL_TOKEN"],
  twilio: ["TWILIO_API_KEY_SECRET"],
  sendgrid: ["SENDGRID_API_KEY"],
  slack: ["SLACK_BOT_TOKEN"],
  npm: ["NPM_TOKEN"],
  dockerhub: ["DOCKERHUB_ACCESS_TOKEN"],
  kubernetes: ["K8S_SERVICE_ACCOUNT_TOKEN"],
  generic_rest: ["DOPPLER_SERVICE_TOKEN"],
};

const ENVIRONMENTS = ["production", "production", "staging", "development"];

// File target templates: [path, format, keyBuilder]
const FILE_TARGETS: [string, string, (name: string) => string][] = [
  ["demo-app/.env", "env", (n) => n],
  ["deploy/config.json", "json", (n) =>
    n === "NPM_TOKEN"
      ? "credentials.npmToken"
      : n === "DOCKERHUB_ACCESS_TOKEN"
        ? "credentials.dockerHubToken"
        : n === "GITHUB_TOKEN"
          ? "githubToken"
          : n],
  ["ci/pipeline.yaml", "yaml", (n) => n.toLowerCase()],
  ["aws/credentials", "ini", (n) =>
    n === "AWS_ACCESS_KEY_ID" ? "default.aws_access_key_id" : n.toLowerCase()],
];

async function seed() {
  const db = getDb();
  console.log("Seeding TopSpin demo workspace...");

  const existing = await db.select({ id: connectors.id }).from(connectors).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded (connectors exist) — skipping.");
    process.exit(0);
  }

  // ── 1. Connectors ─────────────────────────────────────────────
  const connectorIds = new Map<string, number>();
  const connectorCreatedAt = new Date(Date.now() - 45 * DAY);
  for (const reg of connectorRegistry) {
    // Mixed statuses: mostly connected, a few disconnected/error.
    const roll = Math.random();
    const hasConfig = roll > 0.25;
    const status =
      !hasConfig ? "disconnected" : roll > 0.92 ? "error" : "connected";
    const [{ id }] = await db
      .insert(connectors)
      .values({
        platform: reg.platform,
        displayName: reg.displayName,
        capability: reg.capability,
        configEnc: hasConfig
          ? encryptJson(reg.demoValue ? { demoCredential: reg.demoValue() } : {})
          : null,
        status,
        lastCheckedAt: hasConfig
          ? new Date(Date.now() - rand(1, 72) * HOUR)
          : null,
        createdAt: connectorCreatedAt,
      })
      .$returningId();
    connectorIds.set(reg.platform, id);
  }
  console.log(`Seeded ${connectorIds.size} connectors`);

  // ── 2. Secrets (~40) ──────────────────────────────────────────
  type SeedSecret = {
    id: number;
    name: string;
    environment: string;
    status: (typeof secrets.$inferSelect)["status"];
    policy: RotationPolicy;
  };
  const seededSecrets: SeedSecret[] = [];

  // Assign statuses: index 0-27 healthy, 28-33 due_soon, 34-37 overdue,
  // 38 failed, 39 paused.
  const statusPlan: SeedSecret["status"][] = [
    ...Array(28).fill("healthy"),
    ...Array(6).fill("due_soon"),
    ...Array(4).fill("overdue"),
    "failed",
    "paused",
  ];

  const platforms = connectorRegistry.map((c) => c.platform);
  let secretIdx = 0;
  let platformIdx = 0;
  while (secretIdx < statusPlan.length) {
    const platform = platforms[platformIdx % platforms.length];
    platformIdx++;
    const names = SECRET_NAMES[platform];
    const baseName = names[secretIdx % names.length];
    const environment = ENVIRONMENTS[secretIdx % ENVIRONMENTS.length];
    const name =
      environment === "production" ? baseName : `${baseName}_${environment.toUpperCase().slice(0, 3)}`;
    const status = statusPlan[secretIdx];
    const intervalHours = pick([24, 72, 168, 336, 720]);
    const policy: RotationPolicy = {
      intervalHours,
      autoRotate: status !== "paused" && Math.random() > 0.2,
      verifyAfterWrite: Math.random() > 0.15,
    };

    const lastRotatedAt = new Date(Date.now() - rand(2, 20) * DAY);
    let nextDueAt: Date;
    if (status === "overdue") {
      nextDueAt = new Date(Date.now() - rand(2, 96) * HOUR);
    } else if (status === "due_soon") {
      nextDueAt = new Date(Date.now() + rand(1, 20) * HOUR);
    } else {
      nextDueAt = new Date(Date.now() + rand(2, 25) * DAY);
    }

    const [{ id }] = await db
      .insert(secrets)
      .values({
        name,
        connectorId: connectorIds.get(platform)!,
        environment,
        status,
        policyJson: policy as never,
        lastRotatedAt: status === "failed" ? new Date(Date.now() - 30 * DAY) : lastRotatedAt,
        nextDueAt,
        version: rand(1, 12),
        fingerprint: hex16(),
        notes:
          Math.random() > 0.7
            ? `Managed by TopSpin — rotates every ${intervalHours}h`
            : null,
        createdAt: new Date(Date.now() - rand(25, 44) * DAY),
      })
      .$returningId();
    seededSecrets.push({ id, name, environment, status, policy });
    secretIdx++;
  }
  console.log(`Seeded ${seededSecrets.length} secrets`);

  // ── 3. Targets (infisical + 1-2 file + some webhook/keychain) ─
  const targetIdsBySecret = new Map<number, { id: number; kind: string }[]>();
  for (const s of seededSecrets) {
    const list: { id: number; kind: string }[] = [];
    const addTarget = async (
      kind: "infisical" | "file" | "webhook" | "keychain",
      config: Record<string, unknown>,
    ) => {
      const [{ id }] = await db
        .insert(targets)
        .values({
          secretId: s.id,
          kind,
          configJson: config as never,
          enabled: Math.random() > 0.08,
          lastDeliveredAt: new Date(Date.now() - rand(2, 20) * DAY),
          lastStatus: pick(["ok", "ok", "ok", "pending"]),
        })
        .$returningId();
      list.push({ id, kind });
    };

    await addTarget("infisical", {
      baseUrl: "https://app.infisical.com",
      workspaceId: "demo-workspace",
      environment: s.environment === "production" ? "prod" : s.environment,
      secretPath: "/",
      secretName: s.name,
    });
    const fileCount = rand(1, 2);
    const usedFiles = new Set<string>();
    for (let i = 0; i < fileCount; i++) {
      const [filePath, format, keyOf] = pick(FILE_TARGETS);
      const dedup = `${filePath}:${keyOf(s.name)}`;
      if (usedFiles.has(dedup)) continue;
      usedFiles.add(dedup);
      await addTarget("file", { path: filePath, format, key: keyOf(s.name) });
    }
    if (Math.random() > 0.6) {
      await addTarget("webhook", {
        url: "https://hooks.example.com/topspin/rotations",
        method: "POST",
        includeValue: false,
      });
    }
    if (Math.random() > 0.75) {
      await addTarget("keychain", {
        service: `com.topspin.${s.id}`,
        account: s.name,
        synchronizable: Math.random() > 0.5,
      });
    }
    targetIdsBySecret.set(s.id, list);
  }
  const totalTargets = [...targetIdsBySecret.values()].reduce(
    (n, l) => n + l.length,
    0,
  );
  console.log(`Seeded ${totalTargets} targets`);

  // ── 4. Historical rotation runs (~60) + hash-chained audit ────
  const NUM_RUNS = 60;
  type RunPlan = {
    secret: SeedSecret;
    startedAt: Date;
    status: "committed" | "partial" | "failed";
    trigger: "manual" | "scheduled" | "retry";
  };
  const plans: RunPlan[] = [];
  for (let i = 0; i < NUM_RUNS; i++) {
    const secret = pick(seededSecrets);
    const startedAt = new Date(Date.now() - rand(1, 30 * 24) * HOUR - rand(0, 59) * 60000);
    let status: RunPlan["status"] = "committed";
    const roll = Math.random();
    if (roll > 0.92) status = "failed";
    else if (roll > 0.82) status = "partial";
    plans.push({
      secret,
      startedAt,
      status,
      trigger: pick(["scheduled", "scheduled", "scheduled", "manual", "retry"]),
    });
  }
  plans.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const buildSteps = (
    plan: RunPlan,
    newFp: string,
  ): { steps: RotationStep[]; finishedAt: Date; error: string | null } => {
    const steps: RotationStep[] = [];
    let cursor = plan.startedAt.getTime();
    const step = (
      name: RotationStep["step"],
      status: RotationStep["status"],
      durationMs: number,
      message: string,
      targetKind?: RotationStep["targetKind"],
    ) => {
      steps.push({
        step: name,
        status,
        startedAt: new Date(cursor).toISOString(),
        durationMs,
        message,
        targetKind,
      });
      cursor += durationMs + rand(2, 15);
    };
    step("lock", "ok", rand(1, 5), "acquired in-process rotation lock");
    const rotateFailed = plan.status === "failed" && Math.random() > 0.5;
    step(
      "rotate",
      rotateFailed ? "failed" : "ok",
      rand(120, 900),
      rotateFailed
        ? "[demo] connector API returned HTTP 403 — admin credential expired"
        : "[demo] generated new credential (simulated)",
    );
    const targetList = targetIdsBySecret.get(plan.secret.id) ?? [];
    let anyPushFailed = false;
    if (!rotateFailed) {
      for (const t of targetList) {
        const failThis =
          plan.status !== "committed" && t.kind !== "keychain" && Math.random() > 0.7;
        if (failThis) anyPushFailed = true;
        step(
          "push",
          failThis ? "failed" : "ok",
          rand(40, 420),
          failThis
            ? `delivery to ${t.kind} target timed out`
            : t.kind === "file"
              ? "[demo] wrote key to file target"
              : `[demo] delivered to ${t.kind} target (simulated)`,
          t.kind as RotationStep["targetKind"],
        );
      }
      if (plan.secret.policy.verifyAfterWrite) {
        for (const t of targetList) {
          step(
            "verify",
            "ok",
            rand(25, 220),
            `[demo] read-back verified for ${t.kind} (simulated)`,
            t.kind as RotationStep["targetKind"],
          );
        }
      }
      step(
        "commit",
        plan.status === "failed" ? "failed" : "ok",
        rand(4, 25),
        plan.status === "committed"
          ? `committed new version; fingerprint ${newFp}`
          : plan.status === "partial"
            ? "partial commit — some targets failed, flagged for retry"
            : "all target deliveries failed — old value retained",
      );
    } else {
      step("push", "failed", 1, "skipped — rotation produced no value");
      step("commit", "failed", 1, "skipped — nothing to commit");
    }
    step("audit", "ok", rand(2, 12), "audit entry appended (hash-chained)");
    const error =
      plan.status === "committed"
        ? null
        : rotateFailed
          ? "connector rotation failed"
          : anyPushFailed
            ? "one or more target deliveries failed"
            : "rotation failed";
    return { steps, finishedAt: new Date(cursor), error };
  };

  // Chain audit entries in the same chronological order as the runs.
  let prevHash = "0000000000000000";
  const chain = async (
    ts: Date,
    actor: string,
    action: string,
    secretId: number | null,
    detail: unknown,
  ) => {
    const canonical = {
      ts: ts.toISOString(),
      actor,
      action,
      secretId,
      detail: detail ?? null,
    };
    const entryHash = computeEntryHash(prevHash, canonical);
    await db.insert(auditLog).values({
      ts,
      actor,
      action,
      secretId,
      detailJson: (detail ?? null) as never,
      prevHash,
      entryHash,
    });
    prevHash = entryHash;
  };

  // Genesis entries: connector registrations, oldest first.
  for (const reg of connectorRegistry) {
    await chain(connectorCreatedAt, "web-user", "connector.created", null, {
      connectorId: connectorIds.get(reg.platform),
      platform: reg.platform,
      hasConfig: true,
    });
  }

  for (const plan of plans) {
    const newFp = plan.status === "failed" ? null : hex16();
    const { steps, finishedAt, error } = buildSteps(plan, newFp ?? "");
    const [{ id: runId }] = await db
      .insert(rotationRuns)
      .values({
        secretId: plan.secret.id,
        startedAt: plan.startedAt,
        finishedAt,
        status: plan.status,
        trigger: plan.trigger,
        stepsJson: steps as never,
        newFingerprint: newFp,
        error,
      })
      .$returningId();
    await chain(
      finishedAt,
      plan.trigger === "scheduled" ? "scheduler" : "web-user",
      `rotation.${plan.status}`,
      plan.secret.id,
      {
        runId,
        trigger: plan.trigger,
        status: plan.status,
        fingerprint: newFp,
        failedSteps: steps.filter((s) => s.status === "failed").map((s) => s.step),
      },
    );
  }
  console.log(`Seeded ${plans.length} rotation runs with chained audit entries`);

  await writeDemoFiles();
  console.log("Done.");
  process.exit(0); // close MySQL connection pool
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
