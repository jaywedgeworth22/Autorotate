import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ── Autorotate data model ──────────────────────────────────────────
// Hard rule: plaintext secret values are NEVER persisted. Only metadata,
// encrypted connector admin credentials (AES-256-GCM), and sha256
// fingerprint prefixes live in the database.

export const connectors = mysqlTable("connectors", {
  id: serial("id").primaryKey(),
  platform: varchar("platform", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  capability: mysqlEnum("capability", [
    "programmatic",
    "partial",
    "update_only",
  ]).notNull(),
  // AES-256-GCM encrypted JSON of the admin credential/config (base64 payload)
  configEnc: text("configEnc"),
  status: mysqlEnum("status", ["connected", "error", "disconnected"])
    .notNull()
    .default("disconnected"),
  lastCheckedAt: timestamp("lastCheckedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const secrets = mysqlTable("secrets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  connectorId: bigint("connectorId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => connectors.id),
  environment: varchar("environment", { length: 64 })
    .notNull()
    .default("production"),
  status: mysqlEnum("status", [
    "healthy",
    "due_soon",
    "overdue",
    "paused",
    "rotating",
    "failed",
  ])
    .notNull()
    .default("healthy"),
  // { intervalHours: number, autoRotate: boolean, verifyAfterWrite: boolean }
  policyJson: json("policyJson"),
  lastRotatedAt: timestamp("lastRotatedAt"),
  nextDueAt: timestamp("nextDueAt"),
  version: int("version").notNull().default(1),
  // sha256(value)[0:16] fingerprint — never the value itself
  fingerprint: varchar("fingerprint", { length: 16 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const targets = mysqlTable("targets", {
  id: serial("id").primaryKey(),
  secretId: bigint("secretId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => secrets.id),
  kind: mysqlEnum("kind", ["infisical", "file", "webhook", "keychain"]).notNull(),
  configJson: json("configJson"),
  enabled: boolean("enabled").notNull().default(true),
  lastDeliveredAt: timestamp("lastDeliveredAt"),
  lastStatus: mysqlEnum("lastStatus", ["ok", "failed", "pending"])
    .notNull()
    .default("pending"),
});

export const rotationRuns = mysqlTable("rotationRuns", {
  id: serial("id").primaryKey(),
  secretId: bigint("secretId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => secrets.id),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
  status: mysqlEnum("status", ["running", "committed", "partial", "failed"])
    .notNull()
    .default("running"),
  trigger: mysqlEnum("trigger", ["manual", "scheduled", "retry"]).notNull(),
  // Array of RotationStep (see contracts/autorotate.ts)
  stepsJson: json("stepsJson"),
  newFingerprint: varchar("newFingerprint", { length: 16 }),
  error: text("error"),
});

export const auditLog = mysqlTable("auditLog", {
  id: serial("id").primaryKey(),
  // fsp 3: millisecond precision is required — entryHash covers ts.toISOString().
  // No defaultNow: TiDB rejects DEFAULT (now()) on timestamp(3); ts is always
  // set explicitly by appendAudit / the seed.
  ts: timestamp("ts", { fsp: 3 }).notNull(),
  actor: varchar("actor", { length: 128 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  secretId: bigint("secretId", { mode: "number", unsigned: true }),
  detailJson: json("detailJson"),
  // Hash chain: entryHash = sha256(prevHash + canonical(entry)) — full 64-char
  // sha256 hex.  Entries written before AR-07 stored a 16-char (64-bit) prefix;
  // the column is wide enough for both and verifyAuditChain accepts the legacy
  // width up to the first full-width entry (engine.ts).
  prevHash: varchar("prevHash", { length: 64 }).notNull(),
  entryHash: varchar("entryHash", { length: 64 }).notNull(),
});

// Single-row workspace settings (AR-16).  Alert webhooks used to live in a
// module-level global that was lost on restart and never consulted by the
// rotation engine.  No FK columns here, so invariant 4 (bigint unsigned FKs)
// does not apply.
export const workspaceSettings = mysqlTable("workspaceSettings", {
  id: int("id").autoincrement().primaryKey(),
  // WorkspaceAlertConfig (see contracts/autorotate.ts) — webhook URLs only,
  // never a secret value.
  alertsJson: json("alertsJson"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ── Inferred types ─────────────────────────────────────────────
export type Connector = typeof connectors.$inferSelect;
export type InsertConnector = typeof connectors.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type InsertSecret = typeof secrets.$inferInsert;
export type Target = typeof targets.$inferSelect;
export type InsertTarget = typeof targets.$inferInsert;
export type RotationRun = typeof rotationRuns.$inferSelect;
export type InsertRotationRun = typeof rotationRuns.$inferInsert;
export type AuditEntry = typeof auditLog.$inferSelect;
export type InsertAuditEntry = typeof auditLog.$inferInsert;
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
export type InsertWorkspaceSettings = typeof workspaceSettings.$inferInsert;
