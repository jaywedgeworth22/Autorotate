# AutorotateCore audit — 2026-08-31

**Scope:** `apple/AutorotateCore/` (SwiftPM library only)  
**Seat:** Grok · read-only · no secrets printed  
**Prior remediations assumed landed:** AR-08 / AR-12 / AR-18 (hash-chained `AuditEntry`, `kSecUseDataProtectionKeychain` + legacy migration, 16-hex fingerprints)  
**Findings:** 16 (0 critical, 4 high, 8 medium, 4 low) · cap 20 · IDs `AR31-CORE-NN`

## Verdict

Core remains the strongest surface in the monorepo: actor-isolated `RotationEngine`, fail-closed empty-target rotate, sealed in-memory audit store, injectable Keychain backend with migration ordering, and **zero** third-party SPM dependencies (`Package.swift`).  The AR-08/12/18 work holds under re-read.  Remaining holes are fail-open audit persistence, missing outbound URL guards (web fixed SSRF in AR-09; Core did not), capability-matrix drift vs `docs/architecture.md` §3, and thin failure-branch test coverage past the happy path / lock / no-target cases.

## Positive (not findings)

| Area | Evidence |
|---|---|
| No third-party deps | `Package.swift` targets list only Foundation/CryptoKit/Security via system imports |
| Per-secret lock | `RotationEngine.swift:154-169`, tested `AutorotateCoreTests.swift:274-309` |
| Refuse rotate with no enabled target | `RotationEngine.swift:190-197`, tested `:311-346` |
| Partial → `rollbackFlagged` | `RotationEngine.swift:330-348` |
| Fingerprint length 16 | `Fingerprint.swift:32`, tests assert web parity |
| Keychain data-protection + safe migrate | `KeychainManager.swift:223-227`, `:456-464` |
| Audit seal + ms timestamp canonicalization | `AuditChain.swift:110-158`, `AuditChainTests.swift` |
| `AutorotateSHA256` not public | `Crypto.swift:20` (`enum`, internal) |

---

## Findings

### AR31-CORE-01 — High — Audit append is fail-open; AUDIT step always reported succeeded

`RotationEngine.audit` swallows store errors with `try?`.  `finish` then always appends an AUDIT step with `.succeeded`, even when nothing was persisted.  A full rotation can commit targets and bump the secret record while the append-only hash chain silently skips the terminal entry — directly weakening AGENTS.md invariant 2.

Evidence:

- `apple/AutorotateCore/Sources/AutorotateCore/RotationEngine.swift:480-497` (`persist` / `audit` both `try?`)
- `apple/AutorotateCore/Sources/AutorotateCore/RotationEngine.swift:471-475` (AUDIT step hard-coded `.succeeded`)

Remediation: make `audit` / `persist` throwing (or return `Bool`); if append fails, mark AUDIT `.failed` and surface run status accordingly (at least `.partial` / dedicated failure).  Add a unit test with a throwing `AuditStore`.

---

### AR31-CORE-02 — High — No HTTPS / private-network guard on webhook or connector URLs

Web AR-09 added SSRF guards.  Core will `URLSession` any scheme/host the config supplies: webhook PUSH, `GenericRESTConnector` templates, npm `registryUrl`, Kubernetes `apiServer`, Infisical `baseUrl`.  Combined with `WebhookTargetConfig.includeSecretValue == true`, plaintext can leave the device to `http://`, link-local, or RFC1918 addresses with no Core-side rejection.

Evidence:

- `RotationEngine.swift:394-407` (webhook POST; no URL policy)
- `Connectors+More.swift:687-701` (`GenericRESTConnector` accepts any `URL(string:)`)
- `Connectors+More.swift:294-306` / `:499-514` (npm registry / k8s API server)
- macOS UI only checks `URL(string:)` parseability — `SecretsView.swift:783-788`

Remediation: shared `OutboundURLPolicy` (https-only default; block loopback / link-local / private ranges unless an explicit advanced override); enforce in `push(.webhook)` and connector `rotate` entry points.  Mirror web’s SSRF tests.

---

### AR31-CORE-03 — High — Capability matrix drift (`docs/architecture.md` §3 vs registry vs live types)

AGENTS.md invariant 3: the matrix in `docs/architecture.md` is source of truth.  It disagrees with `ConnectorRegistry` / connector `capability` in both directions, and live programmatic types for Resend / Hugging Face / Neon are orphaned behind catalog `updateOnly` descriptors.

| Platform | architecture.md §3 | Registry / type | Notes |
|---|---|---|---|
| AWS IAM | update-only (“no signed CreateAccessKey”) | `programmatic` + full SigV4 `CreateAccessKey` | `Connectors+Providers.swift:28-94`, `Connectors.swift:142-146` |
| Vercel | ✅ programmatic `POST /v3/user/tokens` | `updateOnly` | `Connectors+More.swift:21-27`, `Connectors.swift:177-182` |
| Slack | ⚠️ partial (`auth.rotate`) | `updateOnly` | `Connectors+More.swift:217-223`, `Connectors.swift:196-200` |
| Resend / HF / Neon | ✅ programmatic | Catalog `updateOnly`; live `*Connector` types exist but are **not** in `shipped` and **not** wired in app `ConnectorFactory` | `Connectors+Catalog.swift:60-71`; live types at `Connectors+Providers.swift:620-769`; iOS factory has no `ResendConnector` cases |

Scheduler uses `ConnectorRegistry.capability(of:)` to skip `updateOnly` (`RotationEngine.swift:120-121`), so matrix/registry lies change what auto-rotates.

Remediation: pick one truth — update §3 **or** demote/promote code — in the same commit; register Resend/HF/Neon in `shipped` (or delete dead types); wire factory cases; extend `testConnectorRegistryCoversMatrix` to assert matrix rows.

---

### AR31-CORE-04 — High — `sanitize` only truncates; provider bodies can land in audit `detail`

Errors become audit/run detail via `String(describing: error).prefix(300)`.  `HTTPError.unexpectedStatus` embeds a 300-char response excerpt.  Providers that echo request material (or return the new secret in an error page) can persist secret-adjacent plaintext into the audit log / run history, violating the fingerprint-only storage rule in spirit.

Evidence:

- `RotationEngine.swift:514-519`
- `HTTPClient.swift:160-164`
- audit path `RotationEngine.swift:369-371` (`detail: ["error": Self.sanitize(error)]`)

Remediation: redact high-entropy / known-prefix tokens (sk_, rk_, AKIA, xox, etc.) before persist; prefer status codes + stable error enums over raw body excerpts in audit `detail`.  Test with a stub HTTP error whose body contains a fake secret.

---

### AR31-CORE-05 — Medium — `AuditChain.verify` never checks the chain anchor against `genesisHash`

For the first chained entry in a window, `expectedPrev` starts `nil`, so `prevHash` is not compared to anything — including `genesisHash` when verifying a full log from the first sealed entry.  An attacker (or buggy store) can point the anchor’s `prevHash` at an arbitrary 64-hex string; the entry still verifies if its own `entryHash` matches that claimed prev.

Evidence:

- `AuditChain.swift:195-238` (especially `:204-222`)
- Documented as window-suffix behavior at `:185-190`, but `AuditStore.verifyChain` uses it for the whole recent window with no separate genesis check (`Stores.swift:77-79`)

Remediation: when `legacyPrefixCount` accounts for all leading unsealed entries and the first chained entry is also the first entry of the *logical* chain (or caller passes `requireGenesis: true`), assert `prev == genesisHash`.  Add a regression test.

---

### AR31-CORE-06 — Medium — All-unsealed logs verify as valid

If an app `AuditStore` forgets to call `AuditChain.seal` (protocol is documentation-only), every entry has `entryHash == nil`.  `verify` counts them as legacy prefix and returns `isValid: true`, `checked: 0`.  Chain integrity can be entirely absent while the UI shows a green check.

Evidence:

- `AuditChain.swift:198-201`, `:236-238`
- Protocol requirement is comment-only: `Stores.swift:51-54`
- Engine relies on the store: constructs unsealed entries at `RotationEngine.swift:490-496`

Remediation: treat “zero chained entries after a cutoff date / app version” as a soft failure in UI; or have the engine seal before append and reject stores that persist nil hashes.  Conformance test that app SwiftData stores must seal (already true for iOS/macOS implementations — keep it that way).

---

### AR31-CORE-07 — Medium — `maxRetries` claimed for PUSH; only ROTATE retries

`RotationPolicy.maxRetries` docs say failed ROTATE/**PUSH** steps retry (`Models.swift:46-48`).  Engine applies `withRetries` only around connector rotate (`RotationEngine.swift:200-210`).  PUSH failures are single-shot (`:239-251`).

Remediation: retry transient PUSH (and optionally VERIFY) per policy, or narrow the policy docstring and UI copy so operators are not misled.

---

### AR31-CORE-08 — Medium — Scheduler fail-open on secret-store errors

`rotateDueSecrets` uses `guard let due = try? await dueSecrets(...) else { return [] }`.  A degraded/unavailable `SecretStore` looks like “nothing due”; scheduled rotations silently stop with no audit entry.

Evidence: `RotationEngine.swift:116-117`

Remediation: propagate/log a `rotationFailed`-class audit for scheduler infrastructure errors; do not equate throw with empty due set.

---

### AR31-CORE-09 — Medium — Partial / rollback path untested

Happy path, lock skip, no-enabled-target, and optional-only-all-failed are covered.  There is **no** test that two required targets with one PUSH/VERIFY failure yield `.partial`, `SecretStatus.partial`, version/fingerprint advance, and `.rollbackFlagged` audit.

Evidence: `AutorotateCoreTests.swift:218-375` (no partial assertion); logic at `RotationEngine.swift:330-348`

Remediation: scripted multi-target test (one succeeding file target, one failing required target).

---

### AR31-CORE-10 — Medium — Infisical-as-source mutates the vault during ROTATE

`InfisicalSourceConnector.rotate` authenticates and **upserts** the new value into Infisical before the engine PUSH/VERIFY/COMMIT (`Connectors+More.swift:600-618`).  If later required targets fail, Infisical already holds the new secret while the run is `.failed` / `.partial` and other targets may still have the old value — asymmetric delivery without an Infisical-specific rollback.

Remediation: treat Infisical source as generate-only in ROTATE (return local CSPRNG value) and rely on the Infisical **target** for PUSH; or document the dual-write hazard and emit `rollbackFlagged` detail when source upsert succeeded but COMMIT did not.

---

### AR31-CORE-11 — Medium — Old provider keys deleted best-effort with `try?` after mint

Stripe / OpenAI / Anthropic / Twilio / SendGrid / npm / Docker Hub / Resend mint then `try?` delete the old key.  Delete failure leaves two live credentials with no audit signal.  Acceptable degraded mode, but invisible.

Evidence examples: `Connectors+Providers.swift:358-367`, `:445-453`; `Connectors+More.swift:117-126`

Remediation: record delete outcome in rotate detail / a non-secret audit field (`oldKeyDelete: "failed"`) so operators can clean up.

---

### AR31-CORE-12 — Low — Vercel import “validation” does not call the API

Comment promises `GET /v2/user` verification; implementation only trims whitespace (`Connectors+More.swift:40-48`).  Invalid tokens propagate to all targets.

Remediation: implement the documented probe or delete the comment.

---

### AR31-CORE-13 — Low — Stale Keychain service prefix in model docs

`KeychainTargetConfig` says engine default service is `com.autorotate.<secretId>` (`Models.swift:513-515`).  Actual naming is `codes.autorotate.<secretId>` (`KeychainServiceNaming` / `KeychainManager.service`).

Remediation: fix the comment (docs-only; no behavior change).

---

### AR31-CORE-14 — Low — Public `InMemoryAuditStore(seeding:)` bypasses sealing

Marked for tests/previews (`Stores.swift:180-185`) but is `public`.  A shipping app could seed production and permanently disable chaining while `verifyChain` stays green (see AR31-CORE-06).

Remediation: `#if DEBUG` / move seeding to the test target only.

---

### AR31-CORE-15 — Low — `FileTargetEngine` shares `FileManager.default` across concurrent rotates

Struct is `Sendable` with a non-isolated `FileManager` (`FileTargets.swift:56-62`).  Concurrent file targets on overlapping paths rely on OS rename atomicity per file but not on higher-level coordination; two secrets writing the same dotenv key can race.

Remediation: document single-writer-per-path; or serialize file-target writes in the engine per normalized path.

---

### AR31-CORE-16 — Low — Catalog vs live duplicate ids without factory wiring

`ConnectorRegistry.all` merges `shipped + extraCatalog`.  Ids `resend` / `huggingface` / `neon` appear only via catalog (updateOnly) while programmatic structs with the same `connectorId` exist unused.  Apps’ `makeCatalogConnector` path therefore never selects the live types (confirmed: no `ResendConnector` references under `apple/Autorotate-iOS` or `…-macOS` factories).

Remediation: fold into AR31-CORE-03 fix; until then, `@available` / compile-time assert that every `public struct *Connector.connectorId` appears exactly once in `shipped` with matching capability.

---

## Test coverage gaps (summary)

| Branch | Covered? |
|---|---|
| Full commit + fingerprint audit hygiene | Yes |
| Lock skip | Yes |
| No enabled targets | Yes |
| Optional-only all failed | Yes |
| Partial + `rollbackFlagged` | **No** (AR31-CORE-09) |
| Audit store throw during append | **No** (AR31-CORE-01) |
| Webhook / SSRF URL rejection | **No** (AR31-CORE-02) |
| Genesis anchor check | **No** (AR31-CORE-05) |
| Keychain migration | Yes (`KeychainManagerTests`) |
| Audit tamper / legacy prefix | Yes (`AuditChainTests`) |

## Out of scope / deferred

- App SwiftData store correctness beyond noting iOS/macOS `append` already seals (`Stores+SwiftData.swift` in app modules).
- Web engine parity beyond fingerprint length and matrix text.
- Whether AWS SigV4 CreateAccessKey has been live-verified against IAM (code shape looks real; matrix text claims otherwise).
