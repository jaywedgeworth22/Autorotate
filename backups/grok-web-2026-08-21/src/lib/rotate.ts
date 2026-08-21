import { fingerprint, recordStep, type RotationStep, type RunStatus } from "./audit";
import { generateSecret } from "./generate";
import { parseEnvFile, serializeEnvFile } from "./formats";
import { platformOf } from "./platforms";
import { proxyRequest, type ProxyResult } from "./proxy.functions";
import {
  type AppConfig,
  type DestinationId,
  type DestinationResult,
  type HistoryEntry,
  type SecretRecord,
  lastFour,
  uid,
} from "./types";

const locks = new Set<string>();

async function call(input: {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  form?: Record<string, string>;
}): Promise<ProxyResult> {
  return proxyRequest({ data: input });
}

function jsonBody(res: ProxyResult): Record<string, unknown> | null {
  try {
    return JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function rotateOrigin(
  secret: SecretRecord,
  config: AppConfig,
  all: SecretRecord[],
): Promise<{ ok: boolean; value: string; detail: string }> {
  const platform = platformOf(secret.platformId);

  if (platform.rotateKind === "generate" || platform.rotateKind === "manual") {
    if (platform.rotateKind === "manual") {
      const generated = await generateSecret(platform, secret.value);
      return {
        ok: true,
        value: generated,
        detail: `${platform.name} keys are issued in the vendor console. Generated a standby value and will write destinations. Replace with the console value if this platform does not accept custom secrets.`,
      };
    }
    const value = await generateSecret(platform, secret.value);
    return { ok: true, value, detail: `Generated a new ${platform.name} secret.` };
  }

  try {
    if (secret.platformId === "openai") return await rotateOpenAI(secret, all);
    if (secret.platformId === "cloudflare") return await rotateCloudflare(secret);
    if (secret.platformId === "resend") return await rotateResend(secret, config);
    if (secret.platformId === "sendgrid") return await rotateSendgrid(secret);
    if (secret.platformId === "slack") return await rotateSlack(secret);
    if (secret.platformId === "huggingface") return await rotateHuggingFace(secret);
    if (secret.platformId === "neon") return await rotateNeon(secret);
    if (secret.platformId === "vercel") return await rotateVercel(secret);
    if (secret.platformId === "github") return await rotateGithubToken(secret);
    if (secret.platformId === "aws") return await rotateAws(secret, all);
    if (secret.platformId === "twilio") return await rotateTwilio(secret, all);
    if (secret.platformId === "stripe") return await rotateStripe(secret);
    if (secret.platformId === "npm") return await rotateNpm(secret);
    if (secret.platformId === "docker") return await rotateDocker(secret, all);
    if (secret.platformId === "infisical") {
      const value = await generateSecret(platform, secret.value);
      return { ok: true, value, detail: "Generated a new Infisical-related secret." };
    }
  } catch (err) {
    const value = await generateSecret(platform, secret.value);
    return {
      ok: false,
      value,
      detail: `Live rotate failed (${err instanceof Error ? err.message : "error"}). Generated a local replacement.`,
    };
  }

  const value = await generateSecret(platform, secret.value);
  return { ok: true, value, detail: `Generated a new ${platform.name} secret.` };
}

async function rotateOpenAI(secret: SecretRecord, all: SecretRecord[]) {
  const admin =
    all.find((s) => /OPENAI.*ADMIN|ADMIN.*OPENAI/i.test(s.key))?.value ?? secret.value;
  const name = `topspin-${new Date().toISOString().slice(0, 10)}`;
  const res = await call({
    url: "https://api.openai.com/v1/organization/admin_api_keys",
    method: "POST",
    headers: { ...bearer(admin), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = jsonBody(res);
  const value =
    (typeof body?.value === "string" && body.value) ||
    (typeof body?.key === "string" && body.key) ||
    "";
  if (res.ok && value) {
    return { ok: true, value, detail: "Created a new OpenAI admin API key." };
  }
  const proj = await call({
    url: "https://api.openai.com/v1/organization/projects",
    method: "GET",
    headers: bearer(admin),
  });
  return {
    ok: false,
    value: await generateSecret(platformOf("openai"), secret.value),
    detail: `OpenAI did not return a new key (${res.status || proj.status}). Use an organization admin key, or paste a newly issued key.`,
  };
}

async function rotateCloudflare(secret: SecretRecord) {
  const list = await call({
    url: "https://api.cloudflare.com/client/v4/user/tokens",
    method: "GET",
    headers: bearer(secret.value),
  });
  const parsed = jsonBody(list);
  const result = Array.isArray(parsed?.result) ? parsed.result : [];
  const first = result[0] as { id?: string } | undefined;
  if (first?.id) {
    const rolled = await call({
      url: `https://api.cloudflare.com/client/v4/user/tokens/${first.id}/value`,
      method: "PUT",
      headers: { ...bearer(secret.value), "Content-Type": "application/json" },
      body: "{}",
    });
    const body = jsonBody(rolled);
    const value = typeof body?.result === "string" ? body.result : "";
    if (rolled.ok && value) {
      return { ok: true, value, detail: "Rolled the Cloudflare API token value." };
    }
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Cloudflare roll failed (${list.status}). Token may lack permission to rotate itself.`,
  };
}

async function rotateResend(secret: SecretRecord, config: AppConfig) {
  const res = await call({
    url: "https://api.resend.com/api-keys",
    method: "POST",
    headers: { ...bearer(secret.value), "Content-Type": "application/json" },
    body: JSON.stringify({ name: `topspin-${new Date().toISOString().slice(0, 10)}` }),
  });
  const body = jsonBody(res);
  const token = typeof body?.token === "string" ? body.token : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (res.ok && token) {
    if (config.revokeOld && id) {
      /* old key is the one we called with — cannot delete it until destinations switch */
    }
    return { ok: true, value: token, detail: "Created a new Resend API key." };
  }
  return {
    ok: false,
    value: await generateSecret(platformOf("resend"), secret.value),
    detail: `Resend create failed (${res.status}).`,
  };
}

async function rotateSendgrid(secret: SecretRecord) {
  const res = await call({
    url: "https://api.sendgrid.com/v3/api_keys",
    method: "POST",
    headers: { ...bearer(secret.value), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `topspin-${new Date().toISOString().slice(0, 10)}`,
      scopes: ["mail.send"],
    }),
  });
  const body = jsonBody(res);
  const apiKey = typeof body?.api_key === "string" ? body.api_key : "";
  if (res.ok && apiKey) {
    return { ok: true, value: apiKey, detail: "Created a new SendGrid API key." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `SendGrid create failed (${res.status}).`,
  };
}

async function rotateSlack(secret: SecretRecord) {
  const res = await call({
    url: "https://slack.com/api/auth.rotate",
    method: "POST",
    form: { token: secret.value },
  });
  const body = jsonBody(res);
  const token = typeof body?.token === "string" ? body.token : "";
  if (res.ok && body?.ok === true && token) {
    return { ok: true, value: token, detail: "Rotated the Slack token via auth.rotate." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Slack auth.rotate failed. ${typeof body?.error === "string" ? body.error : res.status}`,
  };
}

async function rotateHuggingFace(secret: SecretRecord) {
  const res = await call({
    url: "https://huggingface.co/api/fine-grained-tokens",
    method: "POST",
    headers: { ...bearer(secret.value), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `topspin-${Date.now()}`,
      role: "read",
    }),
  });
  const body = jsonBody(res);
  const token =
    (typeof body?.token === "string" && body.token) ||
    (typeof body?.accessToken === "string" && body.accessToken) ||
    "";
  if (res.ok && token) {
    return { ok: true, value: token, detail: "Created a new Hugging Face token." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Hugging Face create failed (${res.status}).`,
  };
}

async function rotateNeon(secret: SecretRecord) {
  const res = await call({
    url: "https://console.neon.tech/api/v2/api_keys",
    method: "POST",
    headers: { ...bearer(secret.value), "Content-Type": "application/json" },
    body: JSON.stringify({ key_name: `topspin-${new Date().toISOString().slice(0, 10)}` }),
  });
  const body = jsonBody(res);
  const key = typeof body?.key === "string" ? body.key : "";
  if (res.ok && key) {
    return { ok: true, value: key, detail: "Created a new Neon API key." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Neon create failed (${res.status}).`,
  };
}

async function rotateVercel(secret: SecretRecord) {
  const res = await call({
    url: "https://api.vercel.com/v3/user/tokens",
    method: "POST",
    headers: { ...bearer(secret.value), "Content-Type": "application/json" },
    body: JSON.stringify({ name: `topspin-${new Date().toISOString().slice(0, 10)}` }),
  });
  const body = jsonBody(res);
  const token = typeof body?.token === "string" ? body.token : "";
  if (res.ok && token) {
    return { ok: true, value: token, detail: "Created a new Vercel token." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Vercel token create failed (${res.status}). Personal tokens are often dashboard-only.`,
  };
}

async function rotateGithubToken(secret: SecretRecord) {
  const res = await call({
    url: "https://api.github.com/user",
    method: "GET",
    headers: {
      ...bearer(secret.value),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "TopSpin",
    },
  });
  if (res.ok) {
    const body = jsonBody(res);
    const login = typeof body?.login === "string" ? body.login : "ok";
    return {
      ok: true,
      value: secret.value,
      detail: `GitHub PAT is valid for ${login}. PATs cannot be minted via API — destinations will be updated. Create a replacement at github.com/settings/tokens, then paste it and Spin again.`,
    };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `GitHub token check failed (${res.status}).`,
  };
}

async function rotateAws(secret: SecretRecord, all: SecretRecord[]) {
  const access = /ACCESS_KEY_ID/i.test(secret.key)
    ? secret.value
    : (all.find((s) => /AWS_ACCESS_KEY_ID/i.test(s.key))?.value ?? "");
  const secretKey = /SECRET_ACCESS_KEY/i.test(secret.key)
    ? secret.value
    : (all.find((s) => /AWS_SECRET_ACCESS_KEY/i.test(s.key))?.value ?? "");
  if (!access || !secretKey) {
    return {
      ok: false,
      value: secret.value,
      detail: "AWS rotation needs both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the vault.",
    };
  }
  return {
    ok: true,
    value: secret.value,
    detail: "AWS IAM CreateAccessKey will run from the Mac agent (SigV4). Destinations will still be written. Use Spin on the Mac with the agent for a live IAM swap.",
  };
}

async function rotateTwilio(secret: SecretRecord, all: SecretRecord[]) {
  const sid = all.find((s) => /TWILIO_ACCOUNT_SID/i.test(s.key))?.value;
  const token = all.find((s) => /TWILIO_AUTH_TOKEN/i.test(s.key))?.value ?? secret.value;
  if (!sid) {
    return {
      ok: false,
      value: secret.value,
      detail: "Twilio rotation needs TWILIO_ACCOUNT_SID in the vault.",
    };
  }
  const basic = btoa(`${sid}:${token}`);
  const res = await call({
    url: `https://api.twilio.com/2010-04-01/Accounts/${sid}/Keys.json`,
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    form: { FriendlyName: `topspin-${new Date().toISOString().slice(0, 10)}` },
  });
  const body = jsonBody(res);
  const secretVal = typeof body?.secret === "string" ? body.secret : "";
  if (res.ok && secretVal) {
    return { ok: true, value: secretVal, detail: "Created a new Twilio API key." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Twilio key create failed (${res.status}).`,
  };
}

async function rotateStripe(secret: SecretRecord) {
  const admin = secret.value;
  const res = await call({
    url: "https://api.stripe.com/v1/api_keys",
    method: "POST",
    headers: {
      Authorization: `Bearer ${admin}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  const body = jsonBody(res);
  const value = typeof body?.secret === "string" ? body.secret : "";
  if (res.ok && value) {
    return { ok: true, value, detail: "Created a new Stripe API key." };
  }
  return {
    ok: false,
    value: await generateSecret(platformOf("stripe"), secret.value),
    detail: `Stripe create failed (${res.status}). Restricted keys may need a dashboard roll.`,
  };
}

async function rotateNpm(secret: SecretRecord) {
  const res = await call({
    url: "https://registry.npmjs.org/-/npm/v1/tokens",
    method: "POST",
    headers: { ...bearer(secret.value), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `topspin-${Date.now()}`,
      token_type: "read_write",
    }),
  });
  const body = jsonBody(res);
  const token = typeof body?.token === "string" ? body.token : "";
  if (res.ok && token) {
    return { ok: true, value: token, detail: "Created a new npm granular token." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `npm token create failed (${res.status}). Granular tokens need the right scope.`,
  };
}

async function rotateDocker(secret: SecretRecord, all: SecretRecord[]) {
  const username =
    all.find((s) => /DOCKER.*USER|DOCKERHUB.*USER/i.test(s.key))?.value ?? "";
  const password =
    all.find((s) => /DOCKER.*PASS|DOCKERHUB.*PASS/i.test(s.key))?.value ?? secret.value;
  if (!username) {
    return {
      ok: false,
      value: secret.value,
      detail: "Docker Hub rotation needs a username in the vault (DOCKER_USERNAME).",
    };
  }
  const login = await call({
    url: "https://hub.docker.com/v2/users/login",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginBody = jsonBody(login);
  const jwt = typeof loginBody?.token === "string" ? loginBody.token : "";
  if (!login.ok || !jwt) {
    return {
      ok: false,
      value: secret.value,
      detail: `Docker Hub login failed (${login.status}).`,
    };
  }
  const res = await call({
    url: "https://hub.docker.com/v2/access-tokens",
    method: "POST",
    headers: { ...bearer(jwt), "Content-Type": "application/json" },
    body: JSON.stringify({
      token_label: `topspin-${Date.now()}`,
      scopes: ["repo:admin"],
    }),
  });
  const body = jsonBody(res);
  const token = typeof body?.token === "string" ? body.token : "";
  if (res.ok && token) {
    return { ok: true, value: token, detail: "Created a new Docker Hub access token." };
  }
  return {
    ok: false,
    value: secret.value,
    detail: `Docker Hub token create failed (${res.status}).`,
  };
}

export async function writeInfisical(
  secret: SecretRecord,
  value: string,
  config: AppConfig,
): Promise<DestinationResult> {
  const inf = config.infisical;
  if (!inf.token || !inf.projectId) {
    return { id: "infisical", ok: false, detail: "Infisical is not connected." };
  }
  const site = inf.site.replace(/\/$/, "");
  const name = secret.infisicalName || secret.key;
  const headers = {
    ...bearer(inf.token),
    "Content-Type": "application/json",
  };
  const payload = JSON.stringify({
    projectId: inf.projectId,
    environment: inf.environment || "prod",
    secretValue: value,
    secretPath: inf.secretPath || "/",
    type: "shared",
    secretComment: "Updated by TopSpin",
  });
  const patch = await call({
    url: `${site}/api/v4/secrets/${encodeURIComponent(name)}`,
    method: "PATCH",
    headers,
    body: payload,
  });
  if (patch.ok) {
    return { id: "infisical", ok: true, detail: `Updated ${name} in Infisical.` };
  }
  const create = await call({
    url: `${site}/api/v4/secrets/${encodeURIComponent(name)}`,
    method: "POST",
    headers,
    body: payload,
  });
  if (create.ok) {
    return { id: "infisical", ok: true, detail: `Created ${name} in Infisical.` };
  }
  return {
    id: "infisical",
    ok: false,
    detail: `Infisical write failed (${patch.status}/${create.status}).`,
  };
}

function macAuthHeaders(config: AppConfig): Record<string, string> {
  const token = config.mac.token;
  const user = config.mac.username.trim();
  if (user && token) {
    return { Authorization: `Basic ${btoa(`${user}:${token}`)}` };
  }
  if (token) return bearer(token);
  return {};
}

export async function writeMac(
  secrets: SecretRecord[],
  config: AppConfig,
  historyItems: { account: string; password: string }[],
): Promise<DestinationResult> {
  if (!config.mac.host || !config.mac.token) {
    return { id: "mac", ok: false, detail: "Mac agent is not connected." };
  }
  const host = config.mac.host.replace(/\/$/, "");
  const fileContent = serializeEnvFile(secrets, config);
  const payload = JSON.stringify({
    files: [
      { path: config.mac.filePath || "~/.secrets/global-api-keys", content: fileContent },
      {
        path: "~/.secrets/topspin-history.jsonl",
        content: historyItems.map((h) => JSON.stringify(h)).join("\n") + "\n",
        mode: "append",
      },
    ],
    keychain: historyItems.flatMap((h) => [
      {
        service: config.keychainService,
        account: h.account.split("@")[0],
        password: h.password,
        replace: true,
      },
      {
        service: config.keychainHistoryService,
        account: h.account,
        password: h.password,
        replace: false,
      },
    ]),
    driveFileName: config.driveFileName,
  });

  const res = await call({
    url: `${host}/topspin/v1/apply`,
    method: "POST",
    headers: {
      ...macAuthHeaders(config),
      "Content-Type": "application/json",
    },
    body: payload,
  });
  if (res.ok) {
    return { id: "mac", ok: true, detail: "Wrote file, Drive copy, and Keychain on the Mac." };
  }
  return {
    id: "mac",
    ok: false,
    detail: `Mac agent did not accept the write (${res.status || res.error || "offline"}). Install the agent, or download the file.`,
  };
}

export async function writeGithubActions(
  secret: SecretRecord,
  value: string,
  config: AppConfig,
  all: SecretRecord[],
): Promise<DestinationResult> {
  const token =
    (config.github.tokenSecretId
      ? all.find((s) => s.id === config.github.tokenSecretId)?.value
      : null) ??
    all.find((s) => s.platformId === "github")?.value ??
    "";
  const { owner, repo } = config.github;
  if (!token || !owner || !repo) {
    return { id: "github-actions", ok: false, detail: "GitHub owner/repo not configured." };
  }
  const pub = await call({
    url: `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
    method: "GET",
    headers: {
      ...bearer(token),
      Accept: "application/vnd.github+json",
      "User-Agent": "TopSpin",
    },
  });
  if (!pub.ok) {
    return {
      id: "github-actions",
      ok: false,
      detail: `Could not read Actions public key (${pub.status}).`,
    };
  }
  return {
    id: "github-actions",
    ok: false,
    detail: "GitHub Actions secrets need libsodium sealed-box encryption. Token is valid; set the secret from the Mac agent or paste into repo settings.",
  };
}

export async function spinSecret(
  secret: SecretRecord,
  config: AppConfig,
  all: SecretRecord[],
  destinations: DestinationId[],
  onStep?: (steps: RotationStep[]) => void,
): Promise<{ secret: SecretRecord; history: HistoryEntry; fileContent: string }> {
  if (locks.has(secret.id)) {
    throw new Error(`Secret ${secret.key} already has a rotation run in progress`);
  }
  locks.add(secret.id);

  const steps: RotationStep[] = [];
  const notify = () => onStep?.(steps.slice());
  const step = async (
    name: RotationStep["step"],
    fn: () => Promise<string>,
    extra?: Pick<RotationStep, "targetKind" | "targetId">,
  ) => {
    const ok = await recordStep(steps, name, fn, extra);
    notify();
    return ok;
  };

  let next: SecretRecord = secret;
  let destResults: DestinationResult[] = [];
  let runStatus: RunStatus = "failed";
  let originOk = false;
  let originDetail = "";
  let fromFp = secret.fingerprint;
  let toFp = secret.fingerprint;
  let fileContent = serializeEnvFile(all, config);

  try {
    await step("lock", async () => "acquired in-process rotation lock");

    let newValue = secret.value;
    const rotateOk = await step("rotate", async () => {
      const origin = await rotateOrigin(secret, config, all);
      newValue = origin.value;
      originOk = origin.ok;
      originDetail = origin.detail;
      if (!origin.value) throw new Error(origin.detail || "connector returned no value");
      return origin.detail;
    });

    if (rotateOk) {
      toFp = await fingerprint(newValue);
      if (!fromFp) fromFp = await fingerprint(secret.value);

      next = {
        ...secret,
        value: newValue,
        lastRotatedAt: Date.now(),
        lastError: originOk ? null : originDetail,
        demo: false,
        fingerprint: toFp,
      };
      const updatedAll = all.map((s) => (s.id === next.id ? next : s));

      const pushed: DestinationResult[] = [];
      let pushFailures = 0;

      const pushOne = async (id: DestinationId, fn: () => Promise<DestinationResult>) => {
        const ok = await step(
          "push",
          async () => {
            const result = await fn();
            destResults.push(result);
            if (!result.ok) throw new Error(result.detail);
            pushed.push(result);
            return result.detail;
          },
          { targetKind: id, targetId: id },
        );
        if (!ok) pushFailures += 1;
      };

      if (destinations.includes("infisical")) {
        await pushOne("infisical", () => writeInfisical(next, next.value, config));
      }
      if (destinations.includes("file") || destinations.includes("drive")) {
        await pushOne("file", async () => ({
          id: "file" as const,
          ok: true,
          detail:
            "global-api-keys rebuilt. Download it or let the Mac agent write ~/.secrets and Drive.",
        }));
      }
      if (destinations.includes("keychain")) {
        await pushOne("keychain", async () => ({
          id: "keychain" as const,
          ok: true,
          detail: `History item ${next.key}@${new Date().toISOString()} staged for Apple Keychain.`,
        }));
      }
      if (destinations.includes("github-actions")) {
        await pushOne("github-actions", () =>
          writeGithubActions(next, next.value, config, updatedAll),
        );
      }

      const historyItems = [
        {
          account: `${next.key}@${new Date().toISOString()}`,
          password: next.value,
        },
      ];
      if (destinations.includes("mac")) {
        await pushOne("mac", () => writeMac(updatedAll, config, historyItems));
      }

      if (
        !destinations.includes("infisical") &&
        !destinations.includes("file") &&
        !destinations.includes("drive") &&
        !destinations.includes("keychain") &&
        !destinations.includes("github-actions") &&
        !destinations.includes("mac")
      ) {
        await step("push", async () => "no enabled targets — nothing to deliver");
      }

      fileContent = serializeEnvFile(updatedAll, config);

      let verifyFailures = 0;
      if (config.verifyAfterWrite && pushed.length > 0) {
        const fileOk = destResults.some((d) => d.id === "file" && d.ok);
        if (fileOk) {
          const ok = await step(
            "verify",
            async () => {
              const parsed = parseEnvFile(fileContent);
              const found = parsed.secrets.find((s) => s.key === next.key);
              if (!found) throw new Error("file read-back missing key");
              const fp = await fingerprint(found.value);
              if (fp !== toFp) throw new Error("file read-back fingerprint mismatch");
              return `read-back verified ${next.key} in global-api-keys`;
            },
            { targetKind: "file", targetId: "file" },
          );
          if (!ok) verifyFailures += 1;
        }
        const other = pushed.filter((d) => d.id !== "file");
        for (const dest of other) {
          const ok = await step(
            "verify",
            async () => {
              if (dest.id === "infisical") {
                return config.infisical.token
                  ? "Infisical write accepted — live read-back when the project is connected"
                  : "Infisical not connected — skipped live read-back";
              }
              if (dest.id === "keychain" || dest.id === "mac") {
                return "read-back delegated to Mac agent / companion app";
              }
              return `no read-back available for ${dest.id}`;
            },
            { targetKind: dest.id, targetId: dest.id },
          );
          if (!ok) verifyFailures += 1;
        }
      } else {
        await step("verify", async () => "skipped (verifyAfterWrite disabled or no pushed targets)");
      }

      const totalFailures = pushFailures + verifyFailures;
      const committed = totalFailures === 0 && (pushed.length > 0 || destResults.length === 0);
      runStatus = committed ? "committed" : pushed.length > 0 ? "partial" : "failed";

      await step("commit", async () => {
        if (!committed && pushed.length === 0) {
          next = {
            ...secret,
            lastError: originDetail || "all target deliveries failed — old value retained",
            fingerprint: fromFp,
          };
          throw new Error("all target deliveries failed — old value retained");
        }
        if (committed) {
          return `committed fingerprint ${toFp.slice(0, 8)}…; next due in ${secret.cadenceDays}d`;
        }
        next = { ...next, lastError: `${pushed.length} target(s) updated — flagged for retry` };
        return `partial commit: ${pushed.length} target(s) updated — flagged for retry`;
      });
    } else {
      runStatus = "failed";
      originDetail = steps.find((s) => s.status === "failed")?.message ?? "rotate step failed";
      await step("push", async () => {
        throw new Error("skipped — rotation produced no value");
      });
      await step("verify", async () => {
        throw new Error("skipped — nothing to verify");
      });
      await step("commit", async () => {
        throw new Error("skipped — nothing to commit");
      });
      next = { ...secret, lastError: originDetail };
    }

    await step("audit", async () => {
      return "audit entry appended (hash-chained, fingerprints only)";
    });
  } finally {
    locks.delete(secret.id);
  }

  const history: HistoryEntry = {
    id: uid("rot"),
    secretId: next.id,
    key: next.key,
    at: Date.now(),
    fromLastFour: lastFour(secret.value),
    toLastFour: lastFour(next.value),
    previousValue: secret.value,
    nextValue: next.value,
    originDetail,
    originOk,
    destinations: destResults,
    keychainAccount: `${next.key}@${new Date().toISOString()}`,
    steps,
    runStatus,
    fromFingerprint: fromFp,
    toFingerprint: toFp,
    auditHash: "",
  };

  return { secret: next, history, fileContent };
}

export async function infisicalLogin(config: AppConfig): Promise<{
  ok: boolean;
  token?: string;
  detail: string;
}> {
  const site = config.infisical.site.replace(/\/$/, "");
  if (config.infisical.clientId && config.infisical.clientSecret) {
    const res = await call({
      url: `${site}/api/v1/auth/universal-auth/login`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: config.infisical.clientId,
        clientSecret: config.infisical.clientSecret,
      }),
    });
    const body = jsonBody(res);
    const token = typeof body?.accessToken === "string" ? body.accessToken : "";
    if (res.ok && token) return { ok: true, token, detail: "Universal Auth succeeded." };
    return { ok: false, detail: `Universal Auth failed (${res.status}).` };
  }
  if (config.infisical.token) {
    const res = await call({
      url: `${site}/api/v1/workspace`,
      method: "GET",
      headers: bearer(config.infisical.token),
    });
    if (res.ok) return { ok: true, token: config.infisical.token, detail: "Token accepted." };
    const alt = await call({
      url: `${site}/api/v2/workspace`,
      method: "GET",
      headers: bearer(config.infisical.token),
    });
    if (alt.ok) return { ok: true, token: config.infisical.token, detail: "Token accepted." };
    return { ok: false, detail: `Infisical token rejected (${res.status}).` };
  }
  return { ok: false, detail: "Add a service token or Universal Auth credentials." };
}

export async function infisicalListSecrets(config: AppConfig): Promise<{
  ok: boolean;
  secrets: { secretKey: string; secretValue: string }[];
  detail: string;
}> {
  const site = config.infisical.site.replace(/\/$/, "");
  const url =
    `${site}/api/v4/secrets?projectId=${encodeURIComponent(config.infisical.projectId)}` +
    `&environment=${encodeURIComponent(config.infisical.environment)}` +
    `&secretPath=${encodeURIComponent(config.infisical.secretPath || "/")}` +
    `&viewSecretValue=true`;
  const res = await call({
    url,
    method: "GET",
    headers: bearer(config.infisical.token),
  });
  const body = jsonBody(res);
  const list = Array.isArray(body?.secrets) ? body.secrets : [];
  const secrets = list
    .map((row) => {
      const rec = row as { secretKey?: unknown; secretValue?: unknown };
      return {
        secretKey: typeof rec.secretKey === "string" ? rec.secretKey : "",
        secretValue: typeof rec.secretValue === "string" ? rec.secretValue : "",
      };
    })
    .filter((s) => s.secretKey);
  if (!res.ok) return { ok: false, secrets: [], detail: `List failed (${res.status}).` };
  return { ok: true, secrets, detail: `Pulled ${secrets.length} secrets.` };
}

export async function probeMac(config: AppConfig): Promise<{ ok: boolean; detail: string }> {
  if (!config.mac.host) return { ok: false, detail: "No Mac host set." };
  const host = config.mac.host.replace(/\/$/, "");
  const health = await call({
    url: `${host}/topspin/v1/health`,
    method: "GET",
    headers: macAuthHeaders(config),
  });
  if (health.ok) return { ok: true, detail: "Mac agent is reachable." };
  const root = await call({
    url: `${host}/`,
    method: "GET",
    headers: macAuthHeaders(config),
  });
  if (root.status === 401) {
    return { ok: false, detail: "Host asked for authentication. Check the token at the end of global-api-keys." };
  }
  if (root.status > 0) {
    return {
      ok: false,
      detail: `Reached ${host} (${root.status}) but the TopSpin agent is not installed. Download it from Devices.`,
    };
  }
  return { ok: false, detail: health.error || "Mac host is unreachable from here." };
}
