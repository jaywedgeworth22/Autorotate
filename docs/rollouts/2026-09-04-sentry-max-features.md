# 2026-09-04 — Sentry Max Features (Autorotate)

Board `af1ab6e9`.  Branch `grok/sentry-max-features`.  Worktree
`~/apps/autorotate-grok-sentry-max`.

## Changes

- Web User Feedback widget (kill switch `VITE_SENTRY_FEEDBACK_ENABLED=false`).
  Secrets posture unchanged: session Replay 0%, mask-all, scrubbed breadcrumbs.
- iOS profiling 0.1 + error-only Session Replay (session 0%).
- **Android native Sentry ENABLE** (Designer override of prior hold):
  crash+ANR plus masked error Replay 100% / session 0% (secrets app) and
  `profilesSampleRate = 0.1`.

## Verification

- `npx vitest run apps/web/api/lib/sentry.test.ts`
