# 2026-09-01 — Web Sentry SDK, rotation cron, and metrics (Grok, `grok/sentry-fleet-adoption`)

## Summary
Adds the DealDex/BotFleet Vite helper to Autorotate web:

- **`@sentry/react`** in `apps/web/src/lib/sentry.ts`, booted from `src/main.tsx`.  Gated on `VITE_SENTRY_DSN`.  Inert in dev/CI when unset.
- **Aggressive scrubbing** for a secrets-rotation app: `sendDefaultPii: false`, breadcrumbs keep category/level only (no message, no data, no request bodies or query strings), Replay `maskAllText` / `blockAllMedia`.
- **Session Replay** defaults to **0% session / 100% on error**.  Raise `VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE` only if you accept replay volume on this console.
- **No User Feedback widget** (secrets app).
- **`@sentry/node`** in `apps/web/api/lib/sentry.ts` for the 60s rotation scheduler: cron monitor `autorotate-rotation`, metrics `rotation.success` / `rotation.fail` from `rotateSecret` (live runs only; dry-runs skipped).  Gated on `SENTRY_DSN` (falls back to `VITE_SENTRY_DSN`).
- Hono CSP `connect-src` allows Sentry ingest so a configured browser DSN can post.

## Android
**iOS only until Android ships.**  Cocoa is already wired (`SentryTelemetry.swift` + Info.plist).  Do not add the Android Sentry SDK until the Android companion is a real shipped track.

## Env
| Key | Where | Notes |
|-----|-------|-------|
| `VITE_SENTRY_DSN` | Vite build | Public client DSN.  Unset = dark. |
| `SENTRY_DSN` | Node runtime | Scheduler + metrics.  Falls back to `VITE_SENTRY_DSN`. |
| `VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE` | Vite build | Default `0`. |

The `autorotate` Sentry project already has a public DSN (length 95).  There is no Autorotate project on the Jay's Services Vercel team today, so the client DSN is not baked into a production bundle yet.  When a host is attached, set `VITE_SENTRY_DSN` (build) and `SENTRY_DSN` (Node runtime) without committing either value.

## Verification
- `npm test` in `apps/web` — scrubbers + inert metrics.
- `npm run check` — typecheck.
- `npm run lint` if present.
