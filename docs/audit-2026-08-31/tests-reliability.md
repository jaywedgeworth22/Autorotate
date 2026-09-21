# AR tests & reliability audit — 2026-08-31

Read-only pass over vitest, AutorotateCore XCTest, Android JUnit, iOS/macOS UI
tests (none), and CI jobs `web` / `apple` / `android` / `gitleaks` / `codeql`.
No product code was changed.  Cap 20 findings.

**Inventory (approximate, source-counted):**

| Surface | Files | Cases | CI runs them? |
|---|---|---|---|
| Web vitest (`api/**/*.test.ts`) | 3 | ~73 `it()` | Yes (`npm test` in `web` job) |
| AutorotateCore XCTest | 3 | ~60 `func test*` (~44 without Security) | Yes (`swift test`) |
| Android JVM unit | 2 | 10 `@Test` | **No** |
| Android instrumented / Compose | 0 | 0 | No |
| iOS / macOS UI / app unit | 0 | 0 | Build-only |

---

### AR31-TEST-01. Web `rotateSecret` still has zero pipeline tests

`rotateSecret` in `/Users/jay/apps/autorotate-grok/apps/web/api/autorotate/engine.ts`
is the live mint → push → verify → liveness → commit path.  Every vitest case
hits pure helpers (`canMintForTargets`, `computeEntryHash`, `assertSafeWebhookUrl`,
connector `rotate(null)`, etc.).  No test inserts a secret/target row, calls
`rotateSecret`, or asserts committed / partial / failed outcomes against a DB
double.  Helper regressions from AR-02/AR-03/AR-06 can still green while the
orchestrator regresses (claim leak, skipped liveness, wrong status write).

**Gap:** integration / DB-backed tests for commit, partial push failure, and
lock contention.

---

### AR31-TEST-02. Web audit chain is hashed in unit tests, never appended

`computeEntryHash` / `verifyChainLink` are covered in `hardening.test.ts` and
`autorotate.test.ts`.  `appendAudit` (MySQL `GET_LOCK`, ordered prevHash write)
and `verifyAuditChain` (batched walk) have **no** tests.  A broken lock
release, wrong genesis, or non-id ordering can ship while helpers stay green.

**Gap:** transactional append + full-chain verify against a test DB or
in-memory Drizzle driver.

---

### AR31-TEST-03. Auth primitives are tested; `protectedProcedure` is not

`auth.test.ts` covers session mint/verify, expiry, tamper, cookie flags, and
admin token equality.  Nothing mounts the tRPC router or asserts that
`protectedProcedure` rejects `ctx.authenticated === false`, or that
`apps/web/api/routers/autorotate.ts` has no accidental `publicQuery` on a
mutating path.  AR-01 can regress at the middleware boundary with all unit
tests green.

**Gap:** one router-level UNAUTHORIZED suite over a representative mutation
(`secrets.rotateNow`, `targets.upsert`, `audit.verify`).

---

### AR31-TEST-04. Android CI builds but never runs tests

`.github/workflows/ci.yml` `android` job runs `./gradlew assembleDebug` only.
`testImplementation(junit)` and 10 unit tests under
`android/app/src/test/` exist and are invisible to PRs.  `androidTest`
deps (Espresso / Compose BOM) are declared with **zero** `src/androidTest`
sources.

**Fix:** add `./gradlew testDebugUnitTest` (and later connected tests) to the
job.

---

### AR31-TEST-05. Apple CI builds apps but never tests them

`apple` job: `swift test` in AutorotateCore, then `xcodegen` + `xcodebuild …
build` for iOS and macOS.  Schemes declare empty `test:` configs;
`project.yml` has no UI-test or app-unit targets.  Background rotation,
SwiftData stores, QR scanner, scheduler, and Settings never execute under CI.

**Gap:** at least one XCTest target per app, or UI tests for rotate / lock /
audit verify screens.

---

### AR31-TEST-06. Gitleaks and CodeQL are not functional test gates

`secret-scan.yml` / gitleaks: history secret scan only — does not run product
tests.  `codeql.yml`: JavaScript/TypeScript on `apps/web` only — no Swift,
Kotlin, or Python agent analysis.  Both are valuable security jobs; neither
substitutes for rotation / SSRF / audit coverage.

---

### AR31-TEST-07. STATUS / docs under-count AutorotateCore tests

`STATUS.md` and several rollouts still say **27/27** Swift tests.  Source now
has ~60 test methods across `AutorotateCoreTests.swift`, `AuditChainTests.swift`,
and `KeychainManagerTests.swift`.  Stale counts hide new suites when someone
“verifies” against the wrong expected number.

---

### AR31-TEST-08. Flake risk: Apple lock test is sleep-based

`RotationEngineTests.testLockSkipsConcurrentRun` uses `Task.sleep` (50 ms then
400 ms) to race two `rotate` calls.  Under CI load the second call can start
after the first finishes → both `.committed`, intermittent failure, or a
false pass if the lock path is never exercised.  Prefer an injectable gate /
continuation, not wall-clock sleeps.

---

### AR31-TEST-09. False green: Android fingerprint length locked at 8

`SecretStoreTest` asserts `record.fingerprint.length == 8`.
`SecretStore.kt` truncates sha256 to 8 hex chars.  AutorotateCore AR-18 and
web crypto both use **16**, with an explicit Swift test that Core must not
drift back.  Android’s suite will fail if someone *fixes* the length to match
the invariant — the test encodes the bug.

**Also:** no test asserts Android never persists plaintext outside the
keystore fake; only that fingerprint ≠ raw value.

---

### AR31-TEST-10. False green / matrix lock-in: AWS IAM capability split

`docs/architecture.md` §3: AWS IAM is **update-only**.  Web
`hardening.test.ts` AR-10 asserts `aws_iam` → `update_only` +
`MANUAL_ROTATION_REQUIRED`.  Apple `ModelTests.testConnectorRegistryCoversMatrix`
asserts `aws.iam` → `.programmatic`, matching `AWSIAMConnector` (SigV4
CreateAccessKey).  Both platforms stay green while the fleet capability matrix
is violated.  Tests protect local code, not the shared source of truth.

---

### AR31-TEST-11. Connector registry tests are presence checks, not behavior

Web `merged live connectors` and Apple `testConnectorRegistryCoversMatrix` /
`CatalogConnectorTests` assert ids and capability enums.  They do not exercise
live rotate HTTP, revoke-on-failure, or error sanitization.  A connector that
returns demo shapes or logs plaintext can pass forever.

---

### AR31-TEST-12. Missing: web rotation **failure** and partial commit

Apple covers no-target refusal and optional-only-all-failed → no commit.
Web only tests `canMintForTargets(0, false) === false` as a boolean helper.
No vitest for: push failure → `partial`, verify failure after push, liveness
probe failure before commit, or scheduler `tick` error accounting.

---

### AR31-TEST-13. Missing: SSRF depth beyond URL helpers (web + Apple)

Web SSRF coverage in `hardening.test.ts` is strong for
`isForbiddenAddress`, `assertSafeWebhookUrl`, redirect refusal, and mixed
public/private A records.  Gaps:

1. **DNS rebinding TOCTOU** — `safeFetch` validates then `fetch(url)` by
   hostname; Node may re-resolve to a private IP.  No pin-to-IP / custom
   dispatcher test.
2. **Apple webhook path** — `RotationEngine` POSTs via `HTTPClient` with no
   scheme/host/SSRF guard tests (or implementation parity with netguard).
3. **Connector `safeFetch` vs bare `fetch`** — only some connector paths use
   `guardUrl`; no audit test that every operator-supplied URL sink goes through
   netguard.

---

### AR31-TEST-14. Missing: audit-chain **break** detection on web DB path

Apple `AuditChainTests` excellently covers edit-in-place, removal, unsealed
tail, legacy prefix, and engine-written chains.  Web has no equivalent that
mutates stored rows and expects `verifyAuditChain().valid === false` with
`brokenAtId`.  Cross-platform invariant 2 is only half-tested.

---

### AR31-TEST-15. Missing: Android rotation (by design) — canary is thin

AR-05 deleted fabricated Android rotation.  `SecretStoreTest` asserts adding a
secret does not create run records — a good tripwire if `rotateSecret` returns.
There is still **no** test that WorkManager / sync workers cannot invent
`completed` runs, and no instrumentation proving biometrics gate storage
(AR-14 remains product risk outside this suite).

---

### AR31-TEST-16. Missing: webhook **delivery** and alert firing

Covered: URL validation, mask shapes, alert message text without secrets.
Not covered: `pushToTarget` webhook POST body (`includeValue` on/off), timeout,
non-2xx → failed step; `notifyRunOutcome` / `notifyOverdue` actually calling
`safeFetch` with masked config; Discord vs Slack payload shapes.  Alert
delivery previously lived in a dead in-memory object (AR-16) — regressions of
that class need an integration test.

---

### AR31-TEST-17. No skipped tests today; silence is not coverage

No `.skip`, `xit`, `XCTSkip`, or `@Ignore` found in active suites.  Reliability
risk is **absence** and **false greens**, not quarantined flakes.  Do not treat
“zero skips” as healthy coverage.

---

### AR31-TEST-18. Vitest environment is Node-only; frontend has zero tests

`vitest.config.ts` includes only `api/**/*.test.ts` with `environment: "node"`.
No React / tRPC client / page tests.  Console auth gate (`RequireAuth`), dry-run
UI, and run retry affordances can break with CI still green.

---

### AR31-TEST-19. KeychainManagerTests are Darwin-gated

Suite is wrapped in `#if canImport(Security)`.  Fine on `macos-latest` CI; a
Linux `swift test` (or docs that claim Linux Core CI) silently drops ~16
AR-12 regression tests.  Document the Darwin requirement next to any Linux
Core claims.

---

### AR31-TEST-20. Prior AR-15 partial fix must not be declared done

Aug 26 audit (AR-15): web CI lacked `npm test` / lint; Android had zero tests;
`rotateSecret` untested.  **Fixed since:** web job now runs `check`, `lint`,
`npm test`, `build`; Android has 10 JVM tests; hardening suite landed for
fail-closed helpers.  **Still open:** `rotateSecret` / `appendAudit` /
middleware integration, Android CI test step, app UI tests, webhook delivery,
DNS pin, fingerprint/capability cross-platform locks (this doc’s AR31-TEST-01
through -16).

---

## Priority order (if fixing)

1. DB-backed `rotateSecret` + `appendAudit` / `verifyAuditChain` (01, 02, 12, 14).
2. `testDebugUnitTest` in Android CI; fix fingerprint assertion to 16 (04, 09).
3. tRPC `protectedProcedure` rejection test (03).
4. Webhook push + alert notify integration; DNS pin test (13, 16).
5. Reconcile AWS IAM matrix vs Apple/web tests (10).
6. Deterministic lock test; app-level Apple tests (08, 05).

## Method

Static read of test sources, `engine.ts` / `netguard.ts` / `middleware.ts` /
`scheduler.ts` / `alerts.ts`, Apple `RotationEngine` / `HTTPClient` / registry,
Android `SecretStore` + Gradle, and `.github/workflows/{ci,secret-scan,codeql}.yml`.
Tests were not executed in this read-only pass; counts are from source
`it()` / `func test` / `@Test` enumeration.
