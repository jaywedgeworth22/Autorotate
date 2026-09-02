# Autorotate Android — official Sentry SDK

- **SDK:** `io.sentry:sentry-android:8.54.0` (no Gradle mapping plugin).
- **Init:** `AutorotateApp.onCreate` before encrypted storage.  `io.sentry.auto-init=false` in the manifest.
- **DSN:** `BuildConfig.SENTRY_DSN` from env `SENTRY_DSN` at compile time.  Unset/empty → SDK not initialized.
- **Privacy:** secrets app — `sendDefaultPii=false`, no screenshots, no view hierarchy, `maxRequestBodySize=NONE`.
- **Sampling:** `tracesSampleRate=0.2`.  Crash + ANR enabled.
- **Gate:** `android/` `./gradlew test`.
