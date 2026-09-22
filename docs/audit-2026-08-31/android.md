# AR31 Android audit — 2026-08-31

> **2026-09-22 archaeology note:** the Android namespace + `applicationId` (`codes.autorotate`) referenced here is **unchanged** by the 2026-09-22 fleet bundle migration — Android was intentionally out of scope for this lane (Java package rename requires directory moves + import refactor; separate future lane).  See `docs/rollouts/2026-09-22-bundle-id-migration.md`.

**Surface:** `android/` · Kotlin + Jetpack Compose · `codes.autorotate` · minSdk 26
**Findings:** AR31-AND-01 … AR31-AND-18

## Re-verification (August 26 follow-ups)

| Prior | Status |
|---|---|
| QR camera (`b8f95fef`) | Still open — paste JSON only |
| Release keystore (`a9d2c89b`) | Still open — unsigned-by-default is correct; no CI signed path |
| Fabricated rotation (#90) | Confirmed gone |
| FLAG_SECURE + auth-bound Keystore | Confirmed present |

### AR31-AND-01 — High — QR “scanner” has no camera

Copy says “Point your camera…”.  Implementation is a mock viewfinder + JSON paste.  CameraX + zxing-core have zero `src/` call sites.  CAMERA permission still declared.

### AR31-AND-02 — High — No release signing identity or publish workflow

CI is `assembleDebug` only.  `versionCode` remains 1.

### AR31-AND-03 — High — Fresh install seeds a fake secret inventory

`EncryptedStorage.getSecrets()` returns `defaultSecrets()` (AWS / Stripe / GitHub, fabricated 8-hex fingerprints) when `secrets_list` is missing.  Return `emptyList()` instead.

### AR31-AND-04 — High — R8 minify with empty ProGuard keep rules + Gson

Release minify can strip `SecretRecord` / pairing models.

### AR31-AND-05 — High — Theme is dark-only (fleet light default)

### AR31-AND-06 — Medium — Pairing and Infisical settings store fields that nothing reads; okhttp has zero call sites

### AR31-AND-07 — Medium — CameraX, zxing, okhttp, work-runtime, INTERNET, CAMERA, POST_NOTIFICATIONS unused

### AR31-AND-08 — Medium — CI never runs `testDebugUnitTest`

### AR31-AND-09 — Medium — Biometric gate defaults off

### AR31-AND-10 — Medium — Import stamps `lastRotatedAt` as now

### AR31-AND-11 — Medium — Fingerprint length 8 vs architecture 16

### AR31-AND-12 — Medium — Architecture overclaims Android as a shared rotation engine

This module is inventory + import only.

### AR31-AND-13 — Medium — No phone/tablet adaptive layout (`WindowSizeClass`)

### AR31-AND-14 — Low — Env import leaves plaintext in Compose fields after success

### AR31-AND-15 — Low — Dead `RotationRun` / `autoRotate = true` model on a read-only app

### AR31-AND-16 — Low — Biometric / security-crypto on alpha channels

### AR31-AND-17 — Low — Pairing `baseUrl` not validated as https

### AR31-AND-18 — Info — `allowBackup=false`; no export path; no committed APK in tree.  History may still hold AR-33 APK.
