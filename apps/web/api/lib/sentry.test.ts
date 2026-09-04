import { describe, it, expect } from "vitest";
import {
  scrubBreadcrumb,
  scrubEvent,
  recordRotationOutcome,
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
  it("ships feedbackIntegration with a kill switch", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../src/lib/sentry.ts"),
      "utf8",
    );
    expect(src).toMatch(/feedbackIntegration\(/);
    expect(src).toMatch(/VITE_SENTRY_FEEDBACK_ENABLED/);
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
