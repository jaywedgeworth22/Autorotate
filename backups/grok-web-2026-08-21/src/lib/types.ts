import type { AuditEntry, RotationStep, RunStatus } from "./audit";

export type RotateKind = "live-api" | "generate" | "manual";

export type SecretStatus = "healthy" | "due" | "overdue" | "failed" | "demo";

export type DestinationId =
  | "infisical"
  | "file"
  | "keychain"
  | "mac"
  | "drive"
  | "github-actions";

export type PlatformCategory =
  | "secrets"
  | "ai"
  | "git"
  | "cloud"
  | "hosting"
  | "payments"
  | "comms"
  | "data"
  | "apple"
  | "other";

export type SecretRecord = {
  id: string;
  key: string;
  value: string;
  platformId: string;
  destinations: DestinationId[];
  createdAt: number;
  lastRotatedAt: number | null;
  cadenceDays: number;
  note: string;
  demo: boolean;
  lastError: string | null;
  originId: string | null;
  infisicalName: string | null;
  /** sha256(value)[0:16] — stored even when the vault holds the value. */
  fingerprint: string;
};

export type DestinationResult = {
  id: DestinationId;
  ok: boolean;
  detail: string;
};

export type HistoryEntry = {
  id: string;
  secretId: string;
  key: string;
  at: number;
  fromLastFour: string;
  toLastFour: string;
  previousValue: string;
  nextValue: string;
  originDetail: string;
  originOk: boolean;
  destinations: DestinationResult[];
  keychainAccount: string;
  steps: RotationStep[];
  runStatus: RunStatus;
  fromFingerprint: string;
  toFingerprint: string;
  auditHash: string;
};

export type InfisicalConfig = {
  site: string;
  token: string;
  clientId: string;
  clientSecret: string;
  projectId: string;
  projectName: string;
  environment: string;
  secretPath: string;
};

export type MacConfig = {
  host: string;
  username: string;
  token: string;
  filePath: string;
};

export type GithubConfig = {
  owner: string;
  repo: string;
  tokenSecretId: string;
};

export type AppConfig = {
  infisical: InfisicalConfig;
  mac: MacConfig;
  github: GithubConfig;
  filePath: string;
  driveFileName: string;
  keychainService: string;
  keychainHistoryService: string;
  keychainEnabled: boolean;
  revokeOld: boolean;
  verifyAfterWrite: boolean;
  defaultDestinations: DestinationId[];
};

export type VaultState = {
  version: 2;
  secrets: SecretRecord[];
  history: HistoryEntry[];
  auditLog: AuditEntry[];
  config: AppConfig;
  hasPassphrase: boolean;
};

export type PlatformDef = {
  id: string;
  name: string;
  category: PlatformCategory;
  cadenceDays: number;
  rotateKind: RotateKind;
  prefixes: string[];
  nameHints: string[];
  docsUrl: string;
  hint: string;
  generator: "hex-32" | "hex-64" | "base64-48" | "password-32" | "uuid" | "ssh";
};

export function lastFour(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

export function nextDueAt(secret: SecretRecord): number | null {
  if (!secret.lastRotatedAt) return secret.createdAt + secret.cadenceDays * 86400000;
  return secret.lastRotatedAt + secret.cadenceDays * 86400000;
}

export function secretStatus(secret: SecretRecord, now = Date.now()): SecretStatus {
  if (secret.lastError) return "failed";
  if (secret.demo) {
    const due = nextDueAt(secret);
    if (due && now > due + 86400000 * 7) return "overdue";
    if (due && now > due) return "due";
    return "demo";
  }
  const due = nextDueAt(secret);
  if (!due) return "healthy";
  if (now > due + 86400000 * 7) return "overdue";
  if (now > due) return "due";
  return "healthy";
}

export function maskValue(value: string): string {
  const t = value.trim();
  if (t.length < 8) return "••••";
  const prefix = t.slice(0, Math.min(4, t.indexOf("_") > 0 ? t.indexOf("_") + 1 : 4));
  return `${prefix}${"•".repeat(8)}${t.slice(-4)}`;
}

export const DEFAULT_CONFIG: AppConfig = {
  infisical: {
    site: "https://us.infisical.com",
    token: "",
    clientId: "",
    clientSecret: "",
    projectId: "",
    projectName: "",
    environment: "prod",
    secretPath: "/",
  },
  mac: {
    host: "https://mac.jays.services",
    username: "",
    token: "",
    filePath: "~/.secrets/global-api-keys",
  },
  github: {
    owner: "",
    repo: "",
    tokenSecretId: "",
  },
  filePath: "~/.secrets/global-api-keys",
  driveFileName: "global-api-keys",
  keychainService: "TopSpin",
  keychainHistoryService: "TopSpin.history",
  keychainEnabled: true,
  revokeOld: false,
  verifyAfterWrite: true,
  defaultDestinations: ["infisical", "file", "keychain", "mac", "drive"],
};

export function uid(prefix = "id"): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}
