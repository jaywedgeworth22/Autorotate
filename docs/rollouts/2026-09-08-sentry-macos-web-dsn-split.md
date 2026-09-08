# 2026-09-08 — Sentry macOS / web DSN split

Sentry projects are split by platform.  DSNs stay in Infisical; never commit values.

| Surface | Sentry project | Infisical key | Runtime key |
| --- | --- | --- | --- |
| iOS | `autorotate` (`apple-ios`) | `SENTRY_DSN` | Info.plist `SENTRY_DSN` (unchanged) |
| macOS | `autorotate-macos` (`apple-macos`) | `SENTRY_DSN_MACOS` | Info.plist `SENTRY_DSN` via build inject |
| Web | `autorotate-web` (`javascript-react`) | `VITE_SENTRY_DSN` / `SENTRY_DSN_WEB` | `VITE_SENTRY_DSN` (client); `SENTRY_DSN` \|\| `VITE_SENTRY_DSN` (server) |

## macOS

- `apple/Autorotate-macOS/SentryTelemetry.swift` — plist-only DSN, empty = no-op.
- `AutorotateMacApp.init()` calls `SentryTelemetry.start()`.
- `apple/project.yml` links sentry-cocoa SPM on `Autorotate-macOS` (same package as iOS).
- `apple/Autorotate-macOS/Info.plist` expands `$(SENTRY_DSN)`.
- **Ship/CI:** inject Infisical `SENTRY_DSN_MACOS` into the Mac `SENTRY_DSN` build setting (`xcodebuild SENTRY_DSN=...` or equivalent).  Do not write the value into git, `project.yml`, or Info.plist.
- Session Replay / screenshots are iOS-only in sentry-cocoa; Mac sends crashes, hangs, traces (0.2), profiles (0.1), `sendDefaultPii = false`.

## Web (already on main)

`apps/web/src/lib/sentry.ts` already gates on `VITE_SENTRY_DSN` and already has the fleet feature bar: `enableLogs: true`, traces default `0.2`, Replay `maskAllText` / `blockAllMedia`, `sendDefaultPii: false`.  Env key name unchanged.  Hosts should keep using Infisical `VITE_SENTRY_DSN` (and `SENTRY_DSN_WEB` as the Infisical twin for the Node scheduler).

## iOS

Unchanged.  Stays on `autorotate` via plist `SENTRY_DSN`.
