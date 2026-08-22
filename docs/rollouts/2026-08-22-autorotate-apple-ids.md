# 2026-08-22 — Autorotate Apple IDs

## Why

Owner registered `autorotate.codes`.  Public product name is Autorotate.  Do
not TestFlight on `com.topspin.ios`.

## What (code)

| Use | Value |
|-----|-------|
| iOS bundle | `codes.autorotate` |
| macOS bundle | `codes.autorotate.macos` |
| Keychain group | `codes.autorotate.shared` |
| BGTask | `codes.autorotate.refresh` |
| Display name | Autorotate |

Repo / Slack `repo:` is still **TopSpin** until a rename lane.  Keychain
*service* strings stay `com.topspin.<id>` internally.

## Need owner (Apple UI)

Developer portal → Identifiers → App IDs:

1. `codes.autorotate` (iOS), Keychain Sharing on, group `codes.autorotate.shared`.
2. `codes.autorotate.macos` (macOS), same group.
3. ASC app record later (Account Holder).  SKU `autorotate`.  No TestFlight until that exists.

## Verify

```bash
cd apple && xcodegen generate
xcodebuild -project apple/TopSpin.xcodeproj -scheme TopSpin-iOS \
  -destination 'generic/platform=iOS Simulator' build
```
