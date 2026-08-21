/**
 * Parser for ~/.secrets/global-api-keys and similar env-style secret files.
 * Borrowed from the Grok App Builder TopSpin vault (2026-08-21 merge).
 *
 * Understands KEY=value, KEY: value, export KEY=value, quoted values, and a
 * trailing un-keyed token (the Mac agent token at the end of the file).
 */

export type ParsedEnvFile = {
  keys: { key: string; value: string }[];
  agentToken: string;
  macUsername: string;
  headerComments: string[];
};

const AGENT_KEY =
  /^(TOPSPIN_AGENT_TOKEN|TOPSPIN_MAC_TOKEN|MAC_COLLAB_TOKEN|MAC_AGENT_TOKEN|HOST_TOKEN|AGENT_TOKEN|COLLAB_TOKEN)$/i;

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

export function parseGlobalApiKeys(text: string): ParsedEnvFile {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerComments: string[] = [];
  const keys: ParsedEnvFile["keys"] = [];
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

    keys.push({ key, value });
  }

  return { keys, agentToken, macUsername, headerComments };
}

export function serializeGlobalApiKeys(
  keys: { key: string; value: string }[],
  agentToken?: string,
  header = "# TopSpin managed — ~/.secrets/global-api-keys",
): string {
  const lines: string[] = [header, `# Updated ${new Date().toISOString()}`, ""];
  for (const row of keys) {
    lines.push(`${row.key}=${escapeValue(row.value)}`);
  }
  if (agentToken) {
    lines.push("");
    lines.push("# Mac agent token — last line is read by TopSpin and the Mac agent");
    lines.push(`TOPSPIN_AGENT_TOKEN=${escapeValue(agentToken)}`);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function escapeValue(value: string): string {
  if (/[\s#"']/.test(value) || value === "") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
