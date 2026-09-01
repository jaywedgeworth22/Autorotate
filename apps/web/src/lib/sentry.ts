/**
 * Sentry client observability for Autorotate.
 *
 * Gated on VITE_SENTRY_DSN (inlined by Vite at build time).
 * Completely inert in dev/CI when no DSN is provided.
 *
 * Secrets-rotation posture:
 * - sendDefaultPii false
 * - Session Replay 100% on error, 0% session by default
 * - maskAllText / blockAllMedia
 * - breadcrumbs never carry request bodies, query strings, or console text
 * - no User Feedback widget
 */

import * as Sentry from "@sentry/react";

let initialized = false;

function stripQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const cut = url.indexOf("?");
  return cut === -1 ? url : url.slice(0, cut);
}

/** Drop anything that could hold a credential.  Exported for unit tests. */
type ScrubbableEvent = {
  extra?: unknown;
  request?: {
    url?: string;
    method?: string;
    [key: string]: unknown;
  };
  breadcrumbs?: Sentry.Breadcrumb[];
};

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.extra;
  if (event.request) {
    event.request = {
      url: stripQuery(event.request.url),
      method: event.request.method,
    };
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      timestamp: b.timestamp,
      category: b.category,
      type: b.type,
      level: b.level,
    }));
  }
  return event;
}

/** Breadcrumbs keep category/level only — never message or data. */
export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb {
  return {
    timestamp: breadcrumb.timestamp,
    category: breadcrumb.category,
    type: breadcrumb.type,
    level: breadcrumb.level,
  };
}

export function initSentry(): void {
  if (initialized || typeof window === "undefined") return;

  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return;

  const env =
    (import.meta.env.VITE_SENTRY_ENV as string | undefined)?.trim() ||
    (import.meta.env.MODE as string | undefined) ||
    "production";

  const tracesSampleRate = Number(
    (import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined)?.trim() ??
      "0.2",
  );
  const replayRaw = (
    import.meta.env.VITE_SENTRY_REPLAY_ENABLED as string | undefined
  )?.trim();
  const replayDisabled = replayRaw
    ? /^(false|0|off|no)$/i.test(replayRaw)
    : false;
  // Secrets app: session replay off unless an operator raises it.
  const replaysSessionSampleRate = Number(
    (
      import.meta.env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE as string | undefined
    )?.trim() ?? "0",
  );
  const replaysOnErrorSampleRate = Number(
    (
      import.meta.env.VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE as string | undefined
    )?.trim() ?? "1.0",
  );

  Sentry.init({
    dsn,
    environment: env,
    sendDefaultPii: false,
    tracesSampleRate: Number.isFinite(tracesSampleRate)
      ? Math.min(Math.max(tracesSampleRate, 0), 1)
      : 0.2,
    enableLogs: true,
    replaysSessionSampleRate:
      !replayDisabled && Number.isFinite(replaysSessionSampleRate)
        ? replaysSessionSampleRate
        : 0,
    replaysOnErrorSampleRate:
      !replayDisabled && Number.isFinite(replaysOnErrorSampleRate)
        ? replaysOnErrorSampleRate
        : 0,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
    integrations: [
      Sentry.browserTracingIntegration(),
      ...(!replayDisabled
        ? [
            Sentry.replayIntegration({
              maskAllText: true,
              blockAllMedia: true,
            }),
          ]
        : []),
    ],
  });

  initialized = true;
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
