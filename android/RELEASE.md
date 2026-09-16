# Android release process

Follow-up to AR-33/AR-13 (`docs/AUDIT-2026-08-26.md`): PR #87 made release
builds unsigned-by-default instead of falling back to the debug keystore (a
debug-signed release APK can be forged into a trusted update by anyone,
since the debug key ships with every Android SDK install). That closed the
security hole but left an unsigned build with no real release process behind
it. This document is that process. It is a one-time setup per signing
identity — normal releases are just "push a `v*` tag".

## One-time setup (owner action — needs real credentials, not something an
## agent should generate)

1. Generate an upload keystore. Do this on your own machine, never in CI or
   in this repo:

   ```bash
   keytool -genkeypair -v \
     -keystore autorotate-upload.jks \
     -alias autorotate-upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   `keytool` will prompt for a store password, a key password, and your
   name/org for the certificate DN. Keep the resulting `.jks` file and both
   passwords somewhere durable outside this repo (a password manager, not a
   file on disk next to the checkout) — losing it means every future release
   is a different signing identity from 1.0.0's, which Android treats as a
   different app for update purposes.

2. Add four repository secrets — GitHub → this repo → **Settings → Secrets
   and variables → Actions → New repository secret**:

   | Secret name | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | `base64 -i autorotate-upload.jks \| pbcopy` (or `base64 -w0` on Linux), paste the output |
   | `ANDROID_KEYSTORE_PASSWORD` | the store password from step 1 |
   | `ANDROID_KEY_ALIAS` | `autorotate-upload` (or whatever alias you used) |
   | `ANDROID_KEY_PASSWORD` | the key password from step 1 |

   Never commit the `.jks` file or paste these values into a PR, an issue, a
   commit message, or chat — they are release-signing credentials, not
   config. `.github/workflows/release.yml` reads them by name only.

3. That's it. `.github/workflows/release.yml`'s `android-release` job checks
   for `ANDROID_KEYSTORE_BASE64` on every tag push: with it set, it decodes
   the keystore into a throwaway `android/keystore.properties` +
   `upload-keystore.jks` on the runner, builds a signed release APK, deletes
   both files, and uploads the APK to the GitHub Release the same workflow
   run creates. Without it, the job logs a warning and skips cleanly — no
   unsigned or debug-signed artifact is ever uploaded in its place.

## Cutting a release (every time, no credentials involved)

1. Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md` at the top,
   under `## [Unreleased]` if present.
2. Merge that to `main`.
3. Tag and push:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. `.github/workflows/release.yml` runs on the tag push: the `release` job
   creates a GitHub Release from the matching `CHANGELOG.md` section and
   attaches the zipped `apple/` sources; `android-release` runs after it,
   builds the release APK with `versionName` = `X.Y.Z` and `versionCode`
   derived as `major*10000 + minor*100 + patch`, and attaches the signed APK.
5. iOS/macOS still ship separately via `.github/workflows/testflight.yml`
   (`workflow_dispatch`, unrelated to this tag flow) — this process does not
   change that.

## What "real" means here vs. before

Before this: no tag had ever been pushed, `release.yml` had never actually
run, and even if it had, the Android build in CI only ever ran
`assembleDebug` — there was no path from "push a tag" to a distributable,
correctly-signed Android artifact. This process makes that path real:
pushing a tag is now sufficient, once the one-time keystore setup above has
happened. Nothing here changes the requirement that the owner is the one who
generates and custodies the keystore — that is not something a coding agent
should do on the owner's behalf.
