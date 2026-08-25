/**
 * Parser for ~/.secrets/global-api-keys and similar env-style secret files.
 * Borrowed from the Grok App Builder Autorotate vault (2026-08-21 merge).
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
  /^(AUTOROTATE_AGENT_TOKEN|AUTOROTATE_MAC_TOKEN|MAC_COLLAB_TOKEN|MAC_AGENT_TOKEN|HOST_TOKEN|AGENT_TOKEN|COLLAB_TOKEN)$/i;

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
  header = "# Autorotate managed — ~/.secrets/global-api-keys",
): string {
  const lines: string[] = [header, `# Updated ${new Date().toISOString()}`, ""];
  for (const row of keys) {
    lines.push(`${row.key}=${escapeValue(row.value)}`);
  }
  if (agentToken) {
    lines.push("");
    lines.push("# Mac agent token — last line is read by Autorotate and the Mac agent");
    lines.push(`AUTOROTATE_AGENT_TOKEN=${escapeValue(agentToken)}`);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function escapeValue(value: string): string {
  if (/[\s#"']/.test(value) || value === "") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function detectPlatformForKey(key: string, value = ""): string {
  const k = key.toLowerCase();
  const v = value.trim();

  // 1. Value prefix heuristics
  if (v.startsWith("sk_live_") || v.startsWith("rk_live_") || v.startsWith("sk_test_")) return "stripe";
  if (v.startsWith("sk-proj-") || v.startsWith("sk-admin-")) return "openai";
  if (v.startsWith("sk-ant-")) return "anthropic";
  if (v.startsWith("re_")) return "resend";
  if (v.startsWith("AKIA")) return "aws_iam";
  if (v.startsWith("ghp_") || v.startsWith("github_pat_") || v.startsWith("gho_")) return "github";
  if (v.startsWith("xoxb-") || v.startsWith("xoxp-") || v.startsWith("xapp-")) return "slack";
  if (v.startsWith("SG.")) return "sendgrid";
  if (v.startsWith("hf_")) return "huggingface";
  if (v.startsWith("npm_")) return "npm";
  if (v.startsWith("dckr_pat_")) return "dockerhub";
  if (v.startsWith("sbp_")) return "supabase";
  if (v.startsWith("lin_api_")) return "linear";
  if (v.startsWith("ntn_")) return "notion";
  if (v.startsWith("whsec_")) return "webhook_hmac";
  if (v.startsWith("dp.st.")) return "doppler";
  if (v.startsWith("hvs.")) return "vault";
  if (v.startsWith("gsk_")) return "groq";
  if (v.startsWith("xai-")) return "xai";
  if (v.startsWith("AIza")) return "google_ai";
  if (v.startsWith("glpat-")) return "gitlab";

  // 2. Key name heuristics
  if (k.includes("stripe")) return "stripe";
  if (k.includes("openai")) return "openai";
  if (k.includes("anthropic") || k.includes("claude")) return "anthropic";
  if (k.includes("resend")) return "resend";
  if (k.includes("aws") || k.includes("access_key")) return "aws_iam";
  if (k.includes("github")) return "github";
  if (k.includes("slack")) return "slack";
  if (k.includes("cloudflare") || k.includes("cf_token")) return "cloudflare";
  if (k.includes("vercel")) return "vercel";
  if (k.includes("twilio")) return "twilio";
  if (k.includes("sendgrid")) return "sendgrid";
  if (k.includes("huggingface") || k.includes("hf_token")) return "huggingface";
  if (k.includes("neon")) return "neon";
  if (k.includes("npm")) return "npm";
  if (k.includes("docker")) return "dockerhub";
  if (k.includes("supabase")) return "supabase";
  if (k.includes("coolify")) return "coolify";
  if (k.includes("linear")) return "linear";
  if (k.includes("notion")) return "notion";
  if (k.includes("jwt") || k.includes("signing_key")) return "jwt";
  if (k.includes("db_pass") || k.includes("database_pass") || k.includes("postgres_password") || k.includes("mysql_password")) return "database";
  if (k.includes("webhook") || k.includes("hmac")) return "webhook_hmac";
  if (k.includes("infisical")) return "infisical";
  if (k.includes("sentry")) return "generic_rest";
  if (k.includes("postmark")) return "postmark";
  if (k.includes("mailgun")) return "mailgun";
  if (k.includes("groq")) return "groq";
  if (k.includes("gemini") || k.includes("google_ai")) return "google_ai";

  return "generic_secret";
}

