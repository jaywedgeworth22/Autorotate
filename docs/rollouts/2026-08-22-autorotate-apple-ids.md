# 2026-08-22 — Autorotate Apple IDs (portal leftover)

Lives with AG PR #48 (`ag/utility-power-enhancements`).  Duplicate Grok
https://github.com/jaywedgeworth22/Autorotate/pull/50 stays CLOSED.  Do not
reopen it or merge that branch onto #48.

## Why

Product is Autorotate at https://autorotate.codes.  Do not TestFlight on
`com.autorotate.ios`.  Do not treat `autorotate.pw` or `codes.autorotate` as primary.
GitHub may still be https://github.com/jaywedgeworth22/Autorotate.

## What (already in #48 git)

| Use | Value |
|-----|-------|
| iOS bundle | `codes.autorotate` |
| macOS bundle | `codes.autorotate.macos` |
| Keychain group | `codes.autorotate.shared` |
| BGTask | `codes.autorotate.refresh` |
| Display name | Autorotate |
| XcodeGen project | `Autorotate.xcodeproj` |
| Schemes | `Autorotate-iOS`, `Autorotate-macOS` |
| Team (local) | `CC8UTF7ATG` |

## Capabilities (Grok leftover)

App Store Connect **New App** has no capability checkboxes.  Enable these on
Developer portal Identifiers → App IDs → App → Explicit **before** New App.

| Description | Bundle ID | Platform | App ID capability |
|---|---|---|---|
| Autorotate | `codes.autorotate` | iOS | **Keychain Sharing** on; group `codes.autorotate.shared` |
| Autorotate Mac (optional listing) | `codes.autorotate.macos` | macOS | Same Keychain group |

Leave off: Push, Associated Domains, App Groups, iCloud, Sign in with Apple.
Background fetch is Info.plist (`codes.autorotate.refresh`), not an ASC toggle.
macOS sandbox entitlements are Xcode, not New App fields.

Do not create store apps for `codes.autorotate.shared` or
`codes.autorotate.refresh`.  Ignore leftover `code.autorotate.match` if present.

### New App (after App IDs exist)

iOS only.  Name `Autorotate`.  English (U.S.).  Bundle `codes.autorotate`.
SKU `autorotate`.  Full Access.  A second macOS record can wait.

Agents cannot mint Apple Developer portal credentials.  Account Holder only.

## DealDex / ContactLogo (not this PR)

If the Identifiers list is open: DealDex is https://dealdex.net (not `.online`),
bundle `net.dealdex`.  ContactLogo is contactlogo.com — not this repo.

## Verify (#48 tree)

```bash
cd apple && xcodegen generate
xcodebuild -project apple/Autorotate.xcodeproj -scheme Autorotate-iOS \
  -destination 'generic/platform=iOS Simulator' build
```
