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

describe("rotation metrics", () => {
  it("is inert without a DSN and never throws", () => {
    expect(sentryServerEnabled()).toBe(false);
    expect(() => recordRotationOutcome("committed")).not.toThrow();
    expect(() => recordRotationOutcome("failed")).not.toThrow();
    expect(() => recordRotationOutcome("partial")).not.toThrow();
  });
});
