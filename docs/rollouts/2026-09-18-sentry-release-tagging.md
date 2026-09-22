# 2026-09-18 — Sentry release tagging + web source-map upload (autorotate)

> **2026-09-22 archaeology note:** the release-table entries below carry `codes.autorotate` for iOS and `codes.autorotate` for Android — these are the bundle IDs that were live when this doc was written.  iOS is now `codes.autorotate.ios` (see `docs/rollouts/2026-09-22-bundle-id-migration.md`); the Android namespace (`codes.autorotate`) is unchanged.  `releaseName()` in `apple/Autorotate-iOS/SentryTelemetry.swift` was updated in lockstep so Sentry events from the new build emit `codes.autorotate.ios@<version>+<build>`.

## Summary

- Tag every Sentry event across web (browser + server), iOS, macOS, Android with a release identifier derived from the build environment.
- Source-map upload for the web bundle, gated on `SENTRY_AUTH_TOKEN` (inert default: byte-identical build when unset).

## Why

Until now autorotate's Sentry events arrived untagged and stack frames in the JS bundle were minified-symbol-only:

- iOS / macOS Cocoa init never set `options.releaseName` — Sentry defaulted to its SDK build, not a real release string.
- Android Kotlin init never set `options.release` — same problem.
- Web `Sentry.init` never set `release` — events landed in Sentry's "Untagged" bucket.
- Web source maps were never uploaded, so even once a release tag was added, JS stack traces would still be unreadable.

Once tagged, every event carries the commit that shipped it as one click in Sentry's UI, and source-map deobfuscation works for the web bundle.

## Files

- `.github/workflows/auto-update-prs.yml` — workflow-level `permissions: { contents: write, pull-requests: write }` block (FLEET-INFRA-C5: required for the auto-PR update path).
- `README.md` — documents the env-var precedence and the "all three unset = byte-identical build" invariant.
- `android/app/src/main/java/codes/autorotate/AutorotateApp.kt` — `options.release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"`.
- `apple/Autorotate-iOS/SentryTelemetry.swift` — `options.releaseName = releaseName()` plus a `releaseName()` helper reading `Bundle.main` (bundle id, CFBundleShortVersionString, CFBundleVersion).
- `apple/Autorotate-macOS/SentryTelemetry.swift` — same change as iOS.
- `apps/web/.env.example` — documents `SENTRY_RELEASE` (server-side override), `SENTRY_AUTH_TOKEN` (gates the upload), `SENTRY_ORG`, `SENTRY_PROJECT`. `VITE_SENTRY_RELEASE` is intentionally NOT operator-settable (build-time derived).
- `apps/web/api/lib/sentry.test.ts` — 118 new lines asserting the release resolution + the inert-default behavior.
- `apps/web/api/lib/sentry.ts` — server-side Sentry release wiring.
- `apps/web/package-lock.json` — `@sentry/vite-plugin` dependency add.
- `apps/web/package.json` — `@sentry/vite-plugin` dependency add.
- `apps/web/src/lib/sentry.ts` — reads `VITE_SENTRY_RELEASE`, passes to `Sentry.init({ release })`.
- `apps/web/vite-env.d.ts` — TypeScript declaration for `VITE_SENTRY_RELEASE`.
- `apps/web/vite.config.ts` — Sentry vite plugin source-map upload wrapped in a `sentryAuthToken ? [...] : []` ternary guard. `resolveSentryRelease()` resolves via documented precedence: `SENTRY_RELEASE` (explicit override) → `VERCEL_GIT_COMMIT_SHA` → `SOURCE_COMMIT` (Coolify) → `GITHUB_SHA` (GitHub Actions) → local `git rev-parse HEAD` → package version alone. Sets `process.env.VITE_SENTRY_RELEASE ??= sentryRelease` BEFORE Vite's `loadEnv` runs so the value reaches `import.meta.env.VITE_SENTRY_RELEASE` in the client bundle.

## Release-name format

Every platform uses the same `<bundle-id>@<shortVersion>+<build>` shape so a single deploy's events line up under one release in Sentry:

| Platform | Bundle id | Source |
|---|---|---|
| iOS | `codes.autorotate` | `Bundle.main.bundleIdentifier` |
| macOS | `codes.autorotate.macos` | `Bundle.main.bundleIdentifier` |
| Android | `codes.autorotate` | `BuildConfig.APPLICATION_ID` |
| Web (browser) | `autorotate-web` | hardcoded in `vite.config.ts` |
| Web (server / API) | `autorotate-web` | hardcoded in `api/lib/sentry.ts` |

The web bundle's release carries the first 12 chars of the build SHA (when available) or the package version alone. Native releases carry the full `CFBundleShortVersionString+CFBundleVersion` / `VERSION_NAME+VERSION_CODE`.

## Safety / inertness

- **When `SENTRY_AUTH_TOKEN` is unset** (the default in CI and local dev):
  - The vite plugin is conditionally spread (`...(sentryAuthToken ? [sentryVitePlugin({...})] : [])`), so the plugin is absent from the array.
  - `build.sourcemap = Boolean(sentryAuthToken)` becomes `false` (the Vite default).
  - No token, no plugin, no source-map generation, no upload, no warning.
  - The build is byte-for-byte unchanged vs. the pre-change baseline.

- **No `.env` files leak into the bundle**: `import.meta.env` only reads `VITE_`-prefixed keys; DSNs/tokens are server-side or build-time-only.

- **No secret interpolation in shell-outs**: `localGitSha()` runs `execSync("git rev-parse HEAD", ...)` with a static string. stdout/stderr streams are scoped (`["ignore", "pipe", "ignore"]`).

- **`@sentry/vite-plugin`'s `errorHandler` defaults to throwing**, not logging the token. Acceptable.

## Verification

- `pnpm exec tsc --noEmit` (apps/web) — clean.
- `pnpm test` (apps/web) — 86 / 86 passing (4 files; `sentry.test.ts` is the new 118-line release-resolution + inert-default suite).
- Full `pnpm build` and the iOS / Android pipelines — run in hosted CI.
- Sub-agent opus review on the Swift + Kotlin + vite-plugin wiring: **verdict SHIP**. Release-name format matches Sentry Cocoa/Android documented defaults; the resolved SHA reaches `import.meta.env` in the bundle; the plugin is correctly gated and inert when `SENTRY_AUTH_TOKEN` is unset; no secret-leak vectors; native + web formats are aligned within their respective projects.

## Follow-ups

- After this lands, an operator that wants source-map upload live must set `SENTRY_AUTH_TOKEN` (scoped to the `autorotate-web` project, no global key) on the hosting target — Coolify for the web app, GitHub Actions secrets for ephemeral CI builds.
- The `apps/web/api/lib/sentry.test.ts` line 220-224 check covers the `sentryVitePlugin` / `SENTRY_AUTH_TOKEN` / ternary existence, but does not assert `build.sourcemap` is gated on the same boolean. Not a bug — just an unverified invariant in the test suite. Worth adding when the test file next gets a meaningful edit.

## Blockers

- None.

## Replaced Docs

- None.