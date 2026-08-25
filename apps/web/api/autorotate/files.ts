import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { FileTargetConfig } from "@contracts/autorotate";

// Format-aware secret file writer. All paths are sandboxed under
// AUTOROTATE_FILE_ROOT (default: $HOME/app-engine/autorotate-files/ — falls back to
// <cwd>/autorotate-files when that env-independent default isn't available).
// Writes are atomic: tmp file in the same directory + rename.

export class FileTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileTargetError";
  }
}

export function fileRoot(): string {
  if (process.env.AUTOROTATE_FILE_ROOT) return process.env.AUTOROTATE_FILE_ROOT;
  const home = os.homedir();
  return path.join(home || process.cwd(), "app-engine", "autorotate-files");
}

/** Resolve a user path inside the sandbox; throws on escape attempts. */
export function resolveSandboxPath(relPath: string): string {
  const root = path.resolve(fileRoot());
  const abs = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new FileTargetError(
      `Path "${relPath}" escapes the file sandbox (${root})`,
    );
  }
  return abs;
}

async function readIfExists(abs: string): Promise<string> {
  try {
    return await fs.readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

// ── Format updaters: return updated content ─────────────────────

function updateEnv(content: string, key: string, value: string): string {
  const lines = content.length ? content.split("\n") : [];
  const re = new RegExp(`^\\s*(?:export\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
  let replaced = false;
  const out = lines.map((line) => {
    if (!replaced && re.test(line)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    if (out.length && out[out.length - 1] === "") out.pop();
    out.push(`${key}=${value}`);
  }
  return out.join("\n").replace(/\n*$/, "\n");
}

function setByPath(obj: Record<string, unknown>, keyPath: string, value: string) {
  const parts = keyPath.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function updateJson(content: string, keyPath: string, value: string): string {
  let obj: Record<string, unknown> = {};
  if (content.trim()) {
    try {
      obj = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new FileTargetError("JSON target contains invalid JSON");
    }
  }
  setByPath(obj, keyPath, value);
  return JSON.stringify(obj, null, 2) + "\n";
}

function updateFlatDelimited(
  content: string,
  key: string,
  value: string,
  separator: string,
): string {
  const render = separator === ":" ? `${key}: ${value}` : `${key} = ${value}`;
  const lines = content.length ? content.split("\n") : [];
  const re = new RegExp(
    `^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${separator}`,
  );
  let replaced = false;
  const out = lines.map((line) => {
    if (!replaced && re.test(line)) {
      replaced = true;
      return render;
    }
    return line;
  });
  if (!replaced) {
    if (out.length && out[out.length - 1] === "") out.pop();
    out.push(render);
  }
  return out.join("\n").replace(/\n*$/, "\n");
}

/** INI with [section] support: key may be "section.key" or flat "key". */
function updateIni(content: string, keySpec: string, value: string): string {
  const hasSection = keySpec.includes(".");
  if (!hasSection) return updateFlatDelimited(content, keySpec, value, "=");
  const [section, key] = keySpec.split(".", 2);
  const lines = content.length ? content.split("\n") : [`[${section}]`];
  const sectionRe = new RegExp(
    `^\\s*\\[\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\]\\s*$`,
  );
  const keyRe = new RegExp(
    `^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`,
  );
  let inSection = false;
  let sectionFound = false;
  let replaced = false;
  let insertAt = -1;
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*\[.*\]\s*$/.test(line)) {
      if (inSection && !replaced && insertAt === -1) insertAt = out.length;
      inSection = sectionRe.test(line);
      if (inSection) sectionFound = true;
      out.push(line);
      continue;
    }
    if (inSection && !replaced && keyRe.test(line)) {
      out.push(`${key} = ${value}`);
      replaced = true;
      continue;
    }
    out.push(line);
  }
  if (!sectionFound) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push(`[${section}]`, `${key} = ${value}`);
  } else if (!replaced) {
    if (insertAt !== -1) out.splice(insertAt, 0, `${key} = ${value}`);
    else out.push(`${key} = ${value}`);
  }
  return out.join("\n").replace(/\n*$/, "\n");
}

export function renderUpdated(
  cfg: FileTargetConfig,
  content: string,
  value: string,
): string {
  switch (cfg.format) {
    case "env":
      return updateEnv(content, cfg.key, value);
    case "json":
      return updateJson(content, cfg.key, value);
    case "yaml":
      return updateFlatDelimited(content, cfg.key, value, ":");
    case "toml":
      return updateFlatDelimited(content, cfg.key, value, "=");
    case "ini":
      return updateIni(content, cfg.key, value);
    default:
      throw new FileTargetError(`Unsupported file format: ${cfg.format}`);
  }
}

/** Write value into a file target atomically. Returns the sandbox-relative path. */
export async function writeFileTarget(
  cfg: FileTargetConfig,
  value: string,
): Promise<string> {
  const abs = resolveSandboxPath(cfg.path);
  const content = await readIfExists(abs);
  const updated = renderUpdated(cfg, content, value);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.autorotate-${process.pid}-${Date.now()}.tmp`;
  await fs.writeFile(tmp, updated, "utf8");
  await fs.rename(tmp, abs);
  return cfg.path;
}

/** Read back a file target and extract the current value at cfg.key. */
export async function readFileTarget(
  cfg: FileTargetConfig,
): Promise<string | null> {
  const abs = resolveSandboxPath(cfg.path);
  let content: string;
  try {
    content = await fs.readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  if (cfg.format === "json") {
    try {
      const obj = JSON.parse(content) as Record<string, unknown>;
      let cur: unknown = obj;
      for (const part of cfg.key.split(".")) {
        if (typeof cur !== "object" || cur === null) return null;
        cur = (cur as Record<string, unknown>)[part];
      }
      return typeof cur === "string" ? cur : null;
    } catch {
      throw new FileTargetError("JSON target contains invalid JSON");
    }
  }
  const separators: Record<string, string> = { env: "=", yaml: ":", toml: "=", ini: "=" };
  const sep = separators[cfg.format] ?? "=";
  const key = cfg.format === "ini" && cfg.key.includes(".")
    ? cfg.key.split(".", 2)[1]
    : cfg.key;
  const re = new RegExp(
    `^\\s*(?:export\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${sep}\\s*(.*)$`,
    "m",
  );
  const match = content.match(re);
  return match ? match[1].trim() : null;
}
