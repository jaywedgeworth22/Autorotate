import { detectPlatform } from "./platforms";
import {
  DEFAULT_CONFIG,
  type AppConfig,
  type SecretRecord,
  uid,
} from "./types";

export type ParsedFile = {
  secrets: Omit<SecretRecord, "id" | "createdAt" | "lastRotatedAt" | "lastError">[];
  agentToken: string;
  macUsername: string;
  headerComments: string[];
};

const AGENT_KEY =
  /^(TOPSPIN_AGENT_TOKEN|TOPSPIN_MAC_TOKEN|MAC_COLLAB_TOKEN|MAC_AGENT_TOKEN|HOST_TOKEN|AGENT_TOKEN|COLLAB_TOKEN)$/i;

export function parseEnvFile(text: string): ParsedFile {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerComments: string[] = [];
  const secrets: ParsedFile["secrets"] = [];
  let agentToken = "";
  let macUsername = "";
  let seenKv = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith(";")) {
      if (!seenKv) headerComments.push(trimmed);
      const user = trimmed.match(/username[:=]\s*([A-Za-z0-9._-]+)/i);
      if (user?.[1]) macUsername = user[1];
      else if (/mac-collab/i.test(trimmed)) macUsername = "mac-collab";
      continue;
    }

    const exportStripped = trimmed.replace(/^export\s+/, "");
    const eq = exportStripped.indexOf("=");
    const colon = exportStripped.indexOf(":");
    let key = "";
    let value = "";

    if (eq > 0 && (colon < 0 || eq < colon)) {
      key = exportStripped.slice(0, eq).trim();
      value = unquote(exportStripped.slice(eq + 1).trim());
    } else if (colon > 0) {
      key = exportStripped.slice(0, colon).trim();
      value = unquote(exportStripped.slice(colon + 1).trim());
    } else if (!/\s/.test(trimmed) && trimmed.length >= 16) {
      agentToken = trimmed;
      continue;
    } else {
      continue;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue;
    seenKv = true;

    if (AGENT_KEY.test(key) || /MAC.*TOKEN|AGENT.*TOKEN|COLLAB.*TOKEN/i.test(key)) {
      agentToken = value;
      continue;
    }

    const platformId = detectPlatform(key, value);
    secrets.push({
      key,
      value,
      platformId,
      destinations: [...DEFAULT_CONFIG.defaultDestinations],
      cadenceDays: 90,
      note: "",
      demo: false,
      originId: null,
      infisicalName: key,
      fingerprint: "",
    });
  }

  return { secrets, agentToken, macUsername, headerComments };
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function serializeEnvFile(
  secrets: SecretRecord[],
  config: AppConfig,
  header = "# TopSpin managed — ~/.secrets/global-api-keys",
): string {
  const groups = new Map<string, SecretRecord[]>();
  for (const s of secrets) {
    if (s.demo) continue;
    const list = groups.get(s.platformId) ?? [];
    list.push(s);
    groups.set(s.platformId, list);
  }

  const lines: string[] = [
    header,
    `# Updated ${new Date().toISOString()}`,
    "",
  ];

  for (const [platformId, list] of groups) {
    lines.push(`# ${platformId}`);
    for (const s of list.sort((a, b) => a.key.localeCompare(b.key))) {
      lines.push(`${s.key}=${escapeValue(s.value)}`);
    }
    lines.push("");
  }

  if (config.mac.token) {
    lines.push("# Mac agent token — last line is read by TopSpin and the Mac agent");
    lines.push(`TOPSPIN_AGENT_TOKEN=${escapeValue(config.mac.token)}`);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function escapeValue(value: string): string {
  if (/[\s#"']/.test(value) || value === "") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function mergeImported(
  existing: SecretRecord[],
  parsed: ParsedFile,
): SecretRecord[] {
  const byKey = new Map(existing.filter((s) => !s.demo).map((s) => [s.key, s]));
  const now = Date.now();
  for (const incoming of parsed.secrets) {
    const prev = byKey.get(incoming.key);
    if (prev) {
      byKey.set(incoming.key, {
        ...prev,
        value: incoming.value,
        platformId: incoming.platformId,
        infisicalName: incoming.infisicalName,
        demo: false,
        fingerprint: "",
      });
    } else {
      byKey.set(incoming.key, {
        ...incoming,
        id: uid("sec"),
        createdAt: now,
        lastRotatedAt: now,
        lastError: null,
        fingerprint: incoming.fingerprint ?? "",
      });
    }
  }
  return [...byKey.values()];
}
