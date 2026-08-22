import { z } from "zod";
import type {
  connectors,
  secrets,
  targets,
  rotationRuns,
  auditLog,
} from "@db/schema";

// ── TopSpin shared contracts (frontend + backend) ──────────────
// Entity types are inferred from the Drizzle schema — never hand-written.

export type Connector = typeof connectors.$inferSelect;
export type Secret = typeof secrets.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type RotationRun = typeof rotationRuns.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;

// ── Enums ──────────────────────────────────────────────────────
export const CONNECTOR_CAPABILITIES = [
  "programmatic",
  "partial",
  "update_only",
] as const;
export const capabilitySchema = z.enum(CONNECTOR_CAPABILITIES);
export type ConnectorCapability = z.infer<typeof capabilitySchema>;

export const CONNECTOR_STATUSES = ["connected", "error", "disconnected"] as const;
export const connectorStatusSchema = z.enum(CONNECTOR_STATUSES);

export const SECRET_STATUSES = [
  "healthy",
  "due_soon",
  "overdue",
  "paused",
  "rotating",
  "failed",
] as const;
export const secretStatusSchema = z.enum(SECRET_STATUSES);
export type SecretStatus = z.infer<typeof secretStatusSchema>;

export const TARGET_KINDS = ["infisical", "file", "webhook", "keychain"] as const;
export const targetKindSchema = z.enum(TARGET_KINDS);
export type TargetKind = z.infer<typeof targetKindSchema>;

export const RUN_STATUSES = ["running", "committed", "partial", "failed"] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);

export const RUN_TRIGGERS = ["manual", "scheduled", "retry"] as const;
export const runTriggerSchema = z.enum(RUN_TRIGGERS);
export type RunTrigger = z.infer<typeof runTriggerSchema>;

// ── Rotation policy ────────────────────────────────────────────
export const policySchema = z.object({
  intervalHours: z.number().min(1).max(24 * 365),
  autoRotate: z.boolean(),
  verifyAfterWrite: z.boolean(),
});
export type RotationPolicy = z.infer<typeof policySchema>;

export const DEFAULT_POLICY: RotationPolicy = {
  intervalHours: 24 * 30,
  autoRotate: true,
  verifyAfterWrite: true,
};

// ── Rotation run steps ─────────────────────────────────────────
export const RUN_STEP_NAMES = [
  "lock",
  "rotate",
  "push",
  "verify",
  "commit",
  "audit",
] as const;
export const stepStatusSchema = z.enum(["ok", "failed", "skipped", "running"]);
export const rotationStepSchema = z.object({
  step: z.enum(RUN_STEP_NAMES),
  status: stepStatusSchema,
  startedAt: z.string(),
  durationMs: z.number(),
  message: z.string(),
  targetKind: targetKindSchema.optional(),
  targetId: z.number().optional(),
});
export type RotationStep = z.infer<typeof rotationStepSchema>;

// ── Target configs (stored in targets.configJson) ─────────────
export const infisicalTargetConfigSchema = z.object({
  baseUrl: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  workspaceId: z.string().optional(),
  environment: z.string().default("prod"),
  secretPath: z.string().default("/"),
  secretName: z.string().optional(),
});
export type InfisicalTargetConfig = z.infer<typeof infisicalTargetConfigSchema>;

export const FILE_FORMATS = ["env", "json", "yaml", "toml", "ini"] as const;
export const fileFormatSchema = z.enum(FILE_FORMATS);
export type FileFormat = z.infer<typeof fileFormatSchema>;

export const fileTargetConfigSchema = z.object({
  // Path relative to TOPSPIN_FILE_ROOT (sandbox)
  path: z.string().min(1),
  format: fileFormatSchema,
  // Key (dot-notation for JSON, section.key for INI)
  key: z.string().min(1),
});
export type FileTargetConfig = z.infer<typeof fileTargetConfigSchema>;

export const webhookTargetConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "PUT"]).default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
  includeValue: z.boolean().default(false),
});
export type WebhookTargetConfig = z.infer<typeof webhookTargetConfigSchema>;

export const keychainTargetConfigSchema = z.object({
  service: z.string().min(1),
  account: z.string().min(1),
  synchronizable: z.boolean().default(false),
});
export type KeychainTargetConfig = z.infer<typeof keychainTargetConfigSchema>;

// ── API input schemas ──────────────────────────────────────────
export const connectorCreateInput = z.object({
  platform: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  capability: capabilitySchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type ConnectorCreateInput = z.infer<typeof connectorCreateInput>;

export const connectorUpdateInput = z.object({
  id: z.number(),
  displayName: z.string().min(1).max(128).optional(),
  capability: capabilitySchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  status: connectorStatusSchema.optional(),
});

export const secretCreateInput = z.object({
  name: z.string().min(1).max(255),
  connectorId: z.number(),
  environment: z.string().max(64).default("production"),
  notes: z.string().optional(),
  policy: policySchema.partial().optional(),
});

export const secretUpdateInput = z.object({
  id: z.number(),
  name: z.string().min(1).max(255).optional(),
  environment: z.string().max(64).optional(),
  notes: z.string().nullable().optional(),
  status: secretStatusSchema.optional(),
  policy: policySchema.partial().optional(),
});

export const secretListFilter = z
  .object({
    status: secretStatusSchema.optional(),
    connectorId: z.number().optional(),
    environment: z.string().optional(),
    search: z.string().optional(),
  })
  .optional();

export const targetUpsertInput = z.object({
  id: z.number().optional(),
  secretId: z.number(),
  kind: targetKindSchema,
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().default(true),
});

// ── Batch & Import input schemas ──────────────────────────────
export const secretImportItemSchema = z.object({
  name: z.string().min(1).max(255),
  platform: z.string(),
  value: z.string().optional(),
  environment: z.string().default("production"),
  policy: policySchema.partial().optional(),
  targets: z
    .array(
      z.object({
        kind: targetKindSchema,
        config: z.record(z.string(), z.unknown()),
        enabled: z.boolean().default(true),
      }),
    )
    .optional(),
});
export type SecretImportItem = z.infer<typeof secretImportItemSchema>;

export const secretImportBatchInput = z.object({
  items: z.array(secretImportItemSchema),
});
export type SecretImportBatchInput = z.infer<typeof secretImportBatchInput>;

export const secretBatchUpdatePolicyInput = z.object({
  secretIds: z.array(z.number()),
  policy: policySchema.partial(),
});

export const secretBatchSetStatusInput = z.object({
  secretIds: z.array(z.number()),
  status: secretStatusSchema,
});

export const secretBatchDeleteInput = z.object({
  secretIds: z.array(z.number()),
});

export const secretBatchRotateInput = z.object({
  secretIds: z.array(z.number()),
});

// ── Drift check schemas ───────────────────────────────────────
export const secretCheckDriftInput = z.object({
  secretId: z.number(),
});

export const targetDriftResultSchema = z.object({
  targetId: z.number(),
  kind: targetKindSchema,
  status: z.enum(["in_sync", "drifted", "error", "unsupported"]),
  detail: z.string(),
  expectedFingerprint: z.string().nullable(),
  actualFingerprint: z.string().nullable(),
});
export type TargetDriftResult = z.infer<typeof targetDriftResultSchema>;

export const secretDriftResultSchema = z.object({
  secretId: z.number(),
  secretName: z.string(),
  hasDrift: z.boolean(),
  targets: z.array(targetDriftResultSchema),
});
export type SecretDriftResult = z.infer<typeof secretDriftResultSchema>;

// ── Workspace alert settings schema ───────────────────────────
export const workspaceAlertConfigSchema = z.object({
  slackWebhookUrl: z.string().url().optional().or(z.literal("")),
  discordWebhookUrl: z.string().url().optional().or(z.literal("")),
  notifyOnFailure: z.boolean().default(true),
  notifyOnPartial: z.boolean().default(true),
  notifyOnOverdue: z.boolean().default(true),
});
export type WorkspaceAlertConfig = z.infer<typeof workspaceAlertConfigSchema>;

// ── QR Code Pairing payload schema ────────────────────────────
export const pairingPayloadSchema = z.object({
  version: z.number().default(1),
  appName: z.string().default("TopSpin"),
  baseUrl: z.string(),
  environment: z.string().default("production"),
  timestamp: z.string(),
});
export type PairingPayload = z.infer<typeof pairingPayloadSchema>;

// ── Composite/response types used by the frontend ─────────────
export type SecretWithRelations = Secret & {
  connector: Connector | null;
  targets: Target[];
};

export type StatsOverview = {
  demoMode: boolean;
  totalSecrets: number;
  healthPct: number;
  dueSoonCount: number;
  overdueCount: number;
  pausedCount: number;
  failedCount: number;
  rotationsLast30d: number;
  failedRunsLast30d: number;
  coverageByConnector: {
    connectorId: number;
    platform: string;
    displayName: string;
    capability: ConnectorCapability;
    status: string;
    secretCount: number;
  }[];
  recentActivity: AuditEntry[];
};

export type ChainVerification = {
  valid: boolean;
  checked: number;
  brokenAtId: number | null;
};

