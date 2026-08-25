import type { InfisicalTargetConfig } from "@contracts/autorotate";

// Minimal Infisical REST client (Node 20 global fetch).
// Auth: Universal Auth (clientId/clientSecret -> access token).
// All failures raise typed InfisicalError so the pipeline can record
// the failing step instead of crashing.

export type InfisicalErrorCode =
  | "CONFIG_MISSING"
  | "AUTH_FAILED"
  | "NETWORK"
  | "API_ERROR"
  | "NOT_FOUND";

export class InfisicalError extends Error {
  code: InfisicalErrorCode;
  constructor(code: InfisicalErrorCode, message: string) {
    super(message);
    this.name = "InfisicalError";
    this.code = code;
  }
}

export function hasInfisicalConfig(
  cfg: Partial<InfisicalTargetConfig> | null | undefined,
): cfg is InfisicalTargetConfig & {
  clientId: string;
  clientSecret: string;
  workspaceId: string;
} {
  return !!(cfg && cfg.clientId && cfg.clientSecret && cfg.workspaceId);
}

function baseUrlOf(cfg: { baseUrl?: string }): string {
  return (cfg.baseUrl || "https://app.infisical.com").replace(/\/+$/, "");
}

async function request(
  url: string,
  init: RequestInit,
  code: InfisicalErrorCode,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new InfisicalError(
      "NETWORK",
      `Network error contacting Infisical: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new InfisicalError(
      code,
      `Infisical API ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return res;
}

/** Universal Auth login: clientId/clientSecret -> bearer access token. */
export async function login(cfg: InfisicalTargetConfig): Promise<string> {
  if (!hasInfisicalConfig(cfg)) {
    throw new InfisicalError(
      "CONFIG_MISSING",
      "Infisical clientId/clientSecret/workspaceId not configured",
    );
  }
  const res = await request(
    `${baseUrlOf(cfg)}/api/v1/auth/universal-auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
      }),
    },
    "AUTH_FAILED",
  );
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) {
    throw new InfisicalError("AUTH_FAILED", "Infisical returned no accessToken");
  }
  return data.accessToken;
}

/** Upsert a raw secret: POST /api/v3/secrets/raw/{secretName}. */
export async function upsertSecret(
  cfg: InfisicalTargetConfig,
  secretName: string,
  secretValue: string,
): Promise<void> {
  const token = await login(cfg);
  await request(
    `${baseUrlOf(cfg)}/api/v3/secrets/raw/${encodeURIComponent(secretName)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId: cfg.workspaceId,
        environment: cfg.environment || "prod",
        secretPath: cfg.secretPath || "/",
        secretValue,
        type: "shared",
      }),
    },
    "API_ERROR",
  );
}

/** Read-back a raw secret for verification. Returns null if absent. */
export async function readSecret(
  cfg: InfisicalTargetConfig,
  secretName: string,
): Promise<string | null> {
  const token = await login(cfg);
  const url = new URL(
    `${baseUrlOf(cfg)}/api/v3/secrets/raw/${encodeURIComponent(secretName)}`,
  );
  url.searchParams.set("workspaceId", cfg.workspaceId!);
  url.searchParams.set("environment", cfg.environment || "prod");
  url.searchParams.set("secretPath", cfg.secretPath || "/");
  url.searchParams.set("type", "shared");
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new InfisicalError(
      "NETWORK",
      `Network error contacting Infisical: ${(err as Error).message}`,
    );
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new InfisicalError("API_ERROR", `Infisical API ${res.status}`);
  }
  const data = (await res.json()) as { secret?: { secretValue?: string } };
  return data.secret?.secretValue ?? null;
}
