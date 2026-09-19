import { describe, it, expect, afterEach } from "vitest";
import {
  scrubBreadcrumb,
  scrubEvent,
  recordRotationOutcome,
  resolveServerRelease,
  sentryServerEnabled,
} from "./sentry";

describe("sentry scrubbers", () => {
  it("strips request bodies, cookies, headers, and query strings", () => {
    const event = scrubEvent({
      extra: { token: "sk-live" },
      request: {
        url: "https://autorotate.codes/api/trpc?secret=abc",
        method: "POST",
        data: { password: "nope" },
        cookies: { session: "x" },
        headers: { Authorization: "Bearer x" },
      },
      breadcrumbs: [
        {
          timestamp: 1,
          category: "fetch",
          type: "http",
          level: "info",
          message: "Authorization: Bearer sk-live",
          data: { body: "secret=abc" },
        },
      ],
    });

    expect(event.extra).toBeUndefined();
    expect(event.request?.url).toBe("https://autorotate.codes/api/trpc");
    expect(event.request?.method).toBe("POST");
    expect(event.request).not.toHaveProperty("data");
    expect(event.request).not.toHaveProperty("cookies");
    expect(event.request).not.toHaveProperty("headers");
    expect(event.breadcrumbs?.[0]).toEqual({
      timestamp: 1,
      category: "fetch",
      type: "http",
      level: "info",
    });
  });

  it("keeps only category metadata on breadcrumbs", () => {
    const out = scrubBreadcrumb({
      timestamp: 2,
      category: "console",
      type: "default",
      level: "error",
      message: "rotated value sk-live-123",
      data: { arguments: ["sk-live-123"] },
    });
    expect(out).toEqual({
      timestamp: 2,
      category: "console",
      type: "default",
      level: "error",
    });
    expect(out).not.toHaveProperty("message");
    expect(out).not.toHaveProperty("data");
  });
});

describe("Android native Sentry", () => {
  it("inits DSN-gated Replay (session 0% / error 100%) with profiling", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const app = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../android/app/src/main/java/codes/autorotate/AutorotateApp.kt",
      ),
      "utf8",
    );
    expect(app).toMatch(/SentryAndroid\.init/);
    expect(app).toMatch(/sessionReplay\.sessionSampleRate = 0\.0/);
    expect(app).toMatch(/sessionReplay\.onErrorSampleRate = 1\.0/);
    expect(app).toMatch(/profilesSampleRate = 0\.1/);
    expect(app).toMatch(/setMaskAllText\(true\)/);
  });
});

describe("client Feedback widget", () => {
  it("ships feedbackIntegration with a kill switch and subtle configuration", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../src/lib/sentry.ts"),
      "utf8",
    );
    expect(src).toMatch(/feedbackIntegration\(/);
    expect(src).toMatch(/VITE_SENTRY_FEEDBACK_ENABLED/);
    expect(src).toMatch(/autoInject:\s*false/);
    expect(src).toMatch(/formTitle:\s*"Report a Problem"/);
    expect(src).toMatch(/export function openSentryFeedback/);
  });
});

describe("rotation metrics", () => {
  it("is inert without a DSN and never throws", () => {
    expect(sentryServerEnabled()).toBe(false);
    expect(() => recordRotationOutcome("committed")).not.toThrow();
    expect(() => recordRotationOutcome("failed")).not.toThrow();
    expect(() => recordRotationOutcome("partial")).not.toThrow();
  });
});

describe("resolveServerRelease", () => {
  const keys = [
    "SENTRY_RELEASE",
    "VERCEL_GIT_COMMIT_SHA",
    "SOURCE_COMMIT",
    "GITHUB_SHA",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
      delete saved[key];
    }
  });

  function set(key: (typeof keys)[number], value: string | undefined) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("is undefined when no commit SHA source is set", () => {
    for (const key of keys) set(key, undefined);
    expect(resolveServerRelease()).toBeUndefined();
  });

  it("prefers an explicit SENTRY_RELEASE override", () => {
    for (const key of keys) set(key, undefined);
    set("SENTRY_RELEASE", "abcdef1234567890");
    set("VERCEL_GIT_COMMIT_SHA", "ffffffffffffffffffffffffffffffffffffffff");
    expect(resolveServerRelease()).toBe("autorotate-web@abcdef123456");
  });

  it("falls back to VERCEL_GIT_COMMIT_SHA, then SOURCE_COMMIT, then GITHUB_SHA", () => {
    for (const key of keys) set(key, undefined);
    set("VERCEL_GIT_COMMIT_SHA", "1111111111111111111111111111111111111111");
    expect(resolveServerRelease()).toBe("autorotate-web@111111111111");

    set("VERCEL_GIT_COMMIT_SHA", undefined);
    set("SOURCE_COMMIT", "2222222222222222222222222222222222222222");
    expect(resolveServerRelease()).toBe("autorotate-web@222222222222");

    set("SOURCE_COMMIT", undefined);
    set("GITHUB_SHA", "3333333333333333333333333333333333333333");
    expect(resolveServerRelease()).toBe("autorotate-web@333333333333");
  });
});

describe("F12 — Auto Update PRs workflow permissions", () => {
  it("declares a top-level permissions block that can push and update PRs", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const workflow = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../.github/workflows/auto-update-prs.yml",
      ),
      "utf8",
    );
    const beforeJobs = workflow.split(/^jobs:/m)[0];
    expect(beforeJobs).toMatch(/^permissions:/m);
    expect(beforeJobs).toMatch(/contents:\s*write/);
    expect(beforeJobs).toMatch(/pull-requests:\s*write/);
  });
});

describe("F13 — release tagging on the other SDK init sites", () => {
  async function readSibling(relativePath: string): Promise<string> {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    return readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), relativePath),
      "utf8",
    );
  }

  it("iOS sets releaseName from CFBundleShortVersionString + CFBundleVersion", async () => {
    const src = await readSibling(
      "../../../../apple/Autorotate-iOS/SentryTelemetry.swift",
    );
    expect(src).toMatch(/options\.releaseName\s*=/);
    expect(src).toMatch(/CFBundleShortVersionString/);
    expect(src).toMatch(/CFBundleVersion/);
  });

  it("macOS sets releaseName from CFBundleShortVersionString + CFBundleVersion", async () => {
    const src = await readSibling(
      "../../../../apple/Autorotate-macOS/SentryTelemetry.swift",
    );
    expect(src).toMatch(/options\.releaseName\s*=/);
    expect(src).toMatch(/CFBundleShortVersionString/);
    expect(src).toMatch(/CFBundleVersion/);
  });

  it("Android sets options.release from BuildConfig version fields", async () => {
    const src = await readSibling(
      "../../../../android/app/src/main/java/codes/autorotate/AutorotateApp.kt",
    );
    expect(src).toMatch(/options\.release\s*=/);
    expect(src).toMatch(/BuildConfig\.VERSION_NAME/);
    expect(src).toMatch(/BuildConfig\.VERSION_CODE/);
  });

  it("vite.config.ts wires the source-map upload gated on SENTRY_AUTH_TOKEN", async () => {
    const src = await readSibling("../../vite.config.ts");
    expect(src).toMatch(/sentryVitePlugin/);
    expect(src).toMatch(/SENTRY_AUTH_TOKEN/);
    expect(src).toMatch(/sentryAuthToken\s*\?/);
  });
});
