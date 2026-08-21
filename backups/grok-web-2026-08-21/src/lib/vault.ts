import { create } from "zustand";
import { appendAuditEntry, fingerprint, type AuditEntry } from "./audit";
import { detectPlatform, platformOf } from "./platforms";
import { seedSecrets } from "./seed";
import {
  DEFAULT_CONFIG,
  type AppConfig,
  type HistoryEntry,
  type SecretRecord,
  type VaultState,
  uid,
} from "./types";

const DB_NAME = "topspin";
const STORE = "kv";
const VAULT_KEY = "vault";
const WRAP_KEY = "wrap";

type VaultStore = {
  ready: boolean;
  secrets: SecretRecord[];
  history: HistoryEntry[];
  auditLog: AuditEntry[];
  config: AppConfig;
  hasPassphrase: boolean;
  error: string | null;
  load: () => Promise<void>;
  persist: () => Promise<void>;
  replaceSecrets: (secrets: SecretRecord[]) => Promise<void>;
  upsertSecret: (secret: SecretRecord) => Promise<void>;
  removeSecret: (id: string) => Promise<void>;
  setConfig: (patch: Partial<AppConfig> | ((c: AppConfig) => AppConfig)) => Promise<void>;
  addHistory: (entry: HistoryEntry) => Promise<void>;
  appendAudit: (
    actor: string,
    action: string,
    secretId: string | null,
    detail: unknown,
  ) => Promise<AuditEntry>;
  resetDemo: () => Promise<void>;
  wipe: () => Promise<void>;
};

function emptyVault(): VaultState {
  return {
    version: 2,
    secrets: seedSecrets(),
    history: [],
    auditLog: [],
    config: structuredClone(DEFAULT_CONFIG),
    hasPassphrase: false,
  };
}

const initial = emptyVault();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<ArrayBuffer | string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: ArrayBuffer | string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDeviceKey(): Promise<CryptoKey> {
  let raw = await idbGet(WRAP_KEY);
  if (!raw || typeof raw === "string") {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    await idbSet(WRAP_KEY, bytes.buffer);
    raw = bytes.buffer;
  }
  return crypto.subtle.importKey("raw", raw as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptJson(data: VaultState): Promise<ArrayBuffer> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), 12);
  return out.buffer;
}

async function decryptJson(buf: ArrayBuffer): Promise<Record<string, unknown>> {
  const key = await getDeviceKey();
  const bytes = new Uint8Array(buf);
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

function migrateHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const h = row as Partial<HistoryEntry>;
    return {
      id: h.id ?? uid("rot"),
      secretId: h.secretId ?? "",
      key: h.key ?? "",
      at: h.at ?? 0,
      fromLastFour: h.fromLastFour ?? "",
      toLastFour: h.toLastFour ?? "",
      previousValue: h.previousValue ?? "",
      nextValue: h.nextValue ?? "",
      originDetail: h.originDetail ?? "",
      originOk: Boolean(h.originOk),
      destinations: Array.isArray(h.destinations) ? h.destinations : [],
      keychainAccount: h.keychainAccount ?? "",
      steps: Array.isArray(h.steps) ? h.steps : [],
      runStatus: h.runStatus ?? (h.originOk ? "committed" : "partial"),
      fromFingerprint: h.fromFingerprint ?? "",
      toFingerprint: h.toFingerprint ?? "",
      auditHash: h.auditHash ?? "",
    };
  });
}

function migrateSecrets(raw: unknown): SecretRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const s = row as Partial<SecretRecord>;
    return {
      id: s.id ?? uid("sec"),
      key: s.key ?? "",
      value: s.value ?? "",
      platformId: s.platformId ?? "generic",
      destinations: s.destinations ?? [...DEFAULT_CONFIG.defaultDestinations],
      createdAt: s.createdAt ?? Date.now(),
      lastRotatedAt: s.lastRotatedAt ?? null,
      cadenceDays: s.cadenceDays ?? 90,
      note: s.note ?? "",
      demo: Boolean(s.demo),
      lastError: s.lastError ?? null,
      originId: s.originId ?? null,
      infisicalName: s.infisicalName ?? s.key ?? null,
      fingerprint: s.fingerprint ?? "",
    };
  });
}

async function fillFingerprints(secrets: SecretRecord[]): Promise<SecretRecord[]> {
  let changed = false;
  const next = await Promise.all(
    secrets.map(async (s) => {
      if (s.fingerprint || !s.value) return s;
      changed = true;
      return { ...s, fingerprint: await fingerprint(s.value) };
    }),
  );
  return changed ? next : secrets;
}

export const useVault = create<VaultStore>((set, get) => ({
  ready: true,
  secrets: initial.secrets,
  history: initial.history,
  auditLog: initial.auditLog,
  config: initial.config,
  hasPassphrase: false,
  error: null,

  load: async () => {
    if (typeof indexedDB === "undefined") return;
    try {
      const raw = await idbGet(VAULT_KEY);
      if (!raw || typeof raw === "string") {
        const secrets = await fillFingerprints(get().secrets);
        set({ secrets });
        await get().persist();
        return;
      }
      const vault = await decryptJson(raw);
      const secrets = await fillFingerprints(migrateSecrets(vault.secrets));
      set({
        ready: true,
        secrets,
        history: migrateHistory(vault.history),
        auditLog: Array.isArray(vault.auditLog) ? (vault.auditLog as AuditEntry[]) : [],
        config: { ...DEFAULT_CONFIG, ...(vault.config as AppConfig | undefined) },
        hasPassphrase: Boolean(vault.hasPassphrase),
        error: null,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Vault unlock failed",
      });
    }
  },

  persist: async () => {
    if (typeof indexedDB === "undefined") return;
    const { secrets, history, auditLog, config, hasPassphrase } = get();
    const vault: VaultState = {
      version: 2,
      secrets,
      history: history.slice(0, 400),
      auditLog: auditLog.slice(-800),
      config,
      hasPassphrase,
    };
    const buf = await encryptJson(vault);
    await idbSet(VAULT_KEY, buf);
  },

  replaceSecrets: async (secrets) => {
    set({ secrets: await fillFingerprints(secrets) });
    await get().persist();
  },

  upsertSecret: async (secret) => {
    const next = secret.fingerprint ? secret : { ...secret, fingerprint: await fingerprint(secret.value) };
    const secrets = get().secrets.slice();
    const idx = secrets.findIndex((s) => s.id === next.id);
    if (idx >= 0) secrets[idx] = next;
    else secrets.push(next);
    set({ secrets });
    await get().persist();
  },

  removeSecret: async (id) => {
    set({ secrets: get().secrets.filter((s) => s.id !== id) });
    await get().persist();
  },

  setConfig: async (patch) => {
    const current = get().config;
    const next = typeof patch === "function" ? patch(current) : { ...current, ...patch };
    set({ config: next });
    await get().persist();
  },

  addHistory: async (entry) => {
    set({ history: [entry, ...get().history].slice(0, 400) });
    await get().persist();
  },

  appendAudit: async (actor, action, secretId, detail) => {
    const { log, entry } = await appendAuditEntry(get().auditLog, actor, action, secretId, detail);
    set({ auditLog: log });
    await get().persist();
    return entry;
  },

  resetDemo: async () => {
    const empty = emptyVault();
    const secrets = await fillFingerprints(empty.secrets);
    set({ ...empty, secrets, ready: true, error: null });
    await get().persist();
  },

  wipe: async () => {
    set({
      secrets: [],
      history: [],
      auditLog: [],
      config: structuredClone(DEFAULT_CONFIG),
      hasPassphrase: false,
      error: null,
      ready: true,
    });
    await get().persist();
  },
}));

export function newSecret(key: string, value: string, demo = false): SecretRecord {
  const platformId = detectPlatform(key, value);
  const cadenceDays = platformOf(platformId).cadenceDays;
  const now = Date.now();
  return {
    id: uid("sec"),
    key,
    value,
    platformId,
    destinations: [...DEFAULT_CONFIG.defaultDestinations],
    createdAt: now,
    lastRotatedAt: now,
    cadenceDays,
    note: "",
    demo,
    lastError: null,
    originId: null,
    infisicalName: key,
    fingerprint: "",
  };
}
