# TopSpin — Architecture & Rotation Engine Spec

TopSpin rotates secrets across as many platforms as possible and propagates the new
values to every configured target: **Infisical**, **local secret files** (`.env`, JSON,
YAML, TOML, INI like `~/.aws/credentials`), and **Apple Keychain** (native apps).

## 1. Core concepts

| Concept | Description |
|---|---|
| **Connector** | Adapter for one secret platform (AWS IAM, GitHub, Stripe, …). Knows how to `rotate()` a credential using a user-supplied admin credential, or reports itself `updateOnly` when the platform has no programmatic rotation API. |
| **Secret record** | Metadata about ONE managed secret: name, platform/connector id, current reference, rotation policy, target bindings, status, timestamps. **Never stores the plaintext value.** |
| **Target** | Destination that receives the new secret value after rotation: Infisical project/env/path, file target (path + format + key), Keychain item (service/account), webhook. |
| **Rotation run** | One execution of the rotation pipeline for one secret. Produces an audit entry with per-step results. |
| **Policy** | Schedule (interval hours / cron-like), auto-rotate on/off, verify-after-write, retry rules. |

## 2. Rotation pipeline (identical on all platforms)

```
rotate(secretId):
  1. LOCK    — acquire per-secret lock (skip if a run is in progress)
  2. ROTATE  — connector.rotate(adminCredential) -> newSecretValue
               (updateOnly connectors: prompt/import new value manually)
  3. PUSH    — for each enabled target, write newSecretValue:
                 - Infisical: POST /api/v3/secrets/raw/... (upsert) with workspace token
                 - File: parse file by format, set key, atomic rewrite (tmp+rename)
                 - Keychain (native): SecItemAdd/SecItemUpdate, kSecAttrAccessibleAfterFirstUnlock,
                   optional kSecAttrSynchronizable (iCloud Keychain)
                 - Webhook: POST JSON {name, valueRef} (value optional)
  4. VERIFY  — optional read-back per target (Infisical GET, Keychain SecItemCopyMatching)
  5. COMMIT  — if all required targets OK: update record (lastRotatedAt, version+1)
               else: mark PARTIAL/FAILED, keep old value where already written, flag rollback
  6. AUDIT   — append immutable audit entry (never log secret values — hash prefix only)
```

## 3. Connector capability matrix (v1)

| Platform | Programmatic rotation | Mechanism |
|---|---|---|
| Infisical | ✅ (as target & source) | REST v3 raw secrets, service tokens / universal auth |
| AWS IAM | ✅ | CreateAccessKey → propagate → deactivate/delete old |
| GitHub | ⚠️ partial | Fine-grained PATs can't self-rotate; OAuth app secrets ✅ via API; PAT = updateOnly |
| Stripe | ✅ | Roll/create restricted keys via API |
| OpenAI | ✅ | Admin API: create/delete project service-account keys |
| Anthropic | ⚠️ | Admin API key management (workspace-scoped) |
| Cloudflare | ✅ | API token roll (`PUT .../tokens/:id/value`) |
| Vercel | ⚠️ updateOnly | Tokens created in UI; TopSpin stores/propagates |
| Twilio | ✅ | API key create/delete |
| SendGrid | ✅ | API key create/delete (scoped) |
| Slack | ⚠️ updateOnly | App-level tokens rotate in UI |
| npm | ✅ (granular) / ⚠️ | Granular access tokens via API where enabled |
| Docker Hub | ✅ | Personal access tokens create/delete |
| Doppler / generic REST | ✅ | Generic connector: configurable request template |
| Kubernetes secrets | ✅ | kubectl/REST apply as target |
| `.env` / JSON / YAML / TOML / INI files | ✅ | File target engine |

## 4. Infisical integration

- Auth: **Universal Auth** (clientId/clientSecret → access token) or service token.
- Upsert: `POST /api/v3/secrets/raw/{secretName}` with `workspaceId`, `environment`, `secretPath`, `secretValue`.
- Read-back verify: `GET /api/v3/secrets/raw/{secretName}`.
- Config stored per-workspace: baseUrl (default https://app.infisical.com), clientId, clientSecret (stored ONLY in Keychain on native / server-side encrypted on web), workspaceId, environment, path.

## 5. Apple Keychain integration (native)

- `KeychainManager`: generic-password items, service = `com.topspin.<secretId>`, account = secret name.
- Accessibility: `kSecAttrAccessibleAfterFirstUnlock`; optional `kSecAttrSynchronizable = true` (iCloud Keychain) — user toggle, **"if allowed"** per entitlements.
- Access group: `$(AppIdentifierPrefix)com.topspin.shared` so iOS + macOS + extensions share items (documented in entitlements files).
- Keychain is ALSO the credential store for connector admin credentials and Infisical clientSecret on native — the web server uses its DB (AES-GCM encrypted at rest) instead.

## 6. Storage rule (hard requirement)

Plaintext secret values exist only in memory during a rotation run. Persistent stores hold
metadata + references. The ONLY places values land: the provider, Infisical, target files,
Keychain. Audit logs contain `sha256(value)[0:8]` fingerprints only.

## 7. Web data model (Drizzle / MySQL)

- `connectors` (id, platform, displayName, capability, configEnc, createdAt)
- `secrets` (id, name, connectorId, status, policyJson, lastRotatedAt, version, fingerprint)
- `targets` (id, secretId, kind: infisical|file|webhook|keychain, configJson, enabled)
- `rotationRuns` (id, secretId, startedAt, finishedAt, status, stepsJson)
- `auditLog` (id, ts, actor, action, secretId, detailJson)

## 8. API surface (tRPC)

- `connectors.list/create/update/delete/test`
- `secrets.list/get/create/update/delete`
- `secrets.rotateNow(secretId)` → runs pipeline server-side
- `targets.upsert/remove`
- `policies.set` (intervalHours, autoRotate, verify)
- `runs.list(secretId?)`, `audit.list(limit)`
- `scheduler.tick()` — internal: rotates due secrets (called by cron / on server boot)
