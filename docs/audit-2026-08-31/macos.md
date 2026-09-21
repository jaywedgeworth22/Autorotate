# Autorotate macOS audit — 2026-08-31

**Surface:** `apple/Autorotate-macOS/` (SwiftUI, macOS 14+, `codes.autorotate.macos`)
**Findings:** AR31-MAC-01 … AR31-MAC-20
**Mode:** read-only.  Core public-API boundary holds.  Entitlements match `project.yml`.

### AR31-MAC-01 — High — Hard-coded dark theme (fleet light default)

`Theme.swift` near-black tokens, no Light | Dark | System.  `AutorotateMacApp.swift` paints `AutorotateTheme.background` on the detail pane.

### AR31-MAC-02 — Medium — Window min 980pt vs Secrets split ~1020pt

`.frame(minWidth: 980)` vs sidebar 180 + Secrets `HSplitView` 460+380.  Clips on 13″ Split View.

### AR31-MAC-03 — Low — No `NavigationSplitViewVisibility` compact path

### AR31-MAC-04 — Low — Only keyboard shortcut is ⌘⇧R

### AR31-MAC-05 — High — Atomic file writes leave plaintext temps

`FileTargets.swift` writes `.<name>.autorotate-<UUID>.tmp` then rename.  Kill between write and rename leaves secrets on disk.  New files may be umask-world-readable.

### AR31-MAC-06 — High — Bookmark refresh cannot update `displayPath` after a move

`updateBookmark` matches `entity.displayPath == path`.  After resolve-to-new-URL the old path remains; PUSH still aims at the stale path.

### AR31-MAC-07 — Medium — No symlink / canonical-path policy before write

### AR31-MAC-08 — Medium — `SecurityScope` opens every registered file for every rotation

### AR31-MAC-09 — Medium — Scheduler Timer is default RunLoop mode only

### AR31-MAC-10 — Medium — No LaunchAgent; no macOS failure notifications

Quit the MenuBarExtra app and rotations stop.

### AR31-MAC-11 — Info — Keychain data-protection path looks remediated (AR-12)

Confirm on a signed Mac build that `SecItemAdd` with team-prefixed access group succeeds.

### AR31-MAC-12 — Low — TopSpin service-prefix leftovers in Keychain inventory

### AR31-MAC-13 — Low — Stale `com.autorotate.*` copy in UI/README vs live `codes.autorotate.shared`

### AR31-MAC-14 — Info — Entitlements ↔ `project.yml` consistent (pass)

### AR31-MAC-15 — Info — App uses public AutorotateCore API only (pass)

### AR31-MAC-16 — Low — Menu bar incomplete as an ops surface (no failed-run deep link; Quit has no scheduler warning)

### AR31-MAC-17 — Medium — Webhook binding UI can opt into sending plaintext (`includeSecretValue`)

### AR31-MAC-18 — Low — Drag-and-drop registration trusts provider URLs with short-lived scope

### AR31-MAC-19 — Medium — No macOS-target automated tests in `project.yml`

### AR31-MAC-20 — Low — README-macOS.md still says `native/` and `com.autorotate.*`
