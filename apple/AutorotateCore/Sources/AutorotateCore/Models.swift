//
//  Models.swift
//  AutorotateCore
//
//  Core data model for the Autorotate rotation engine.
//
//  STORAGE RULE (hard requirement, see docs/architecture.md §6):
//  Plaintext secret values exist only in memory during a rotation run.
//  Everything in this file is metadata — records, policies, run results,
//  audit entries and target bindings. The only "value-adjacent" field that
//  is ever persisted is `fingerprint`, which is the first 8 hex characters
//  of `sha256(value)` — never the value itself.
//

import Foundation

// MARK: - Connector capability

/// How a platform connector can rotate a secret, per the capability matrix
/// in `docs/architecture.md` §3.
public enum ConnectorCapability: String, Codable, Sendable, CaseIterable {
    /// The platform exposes a real API to create/roll/revoke credentials.
    case programmatic
    /// Rotation is partially programmatic (e.g. GitHub: OAuth app secrets via
    /// API but fine-grained PATs must be rotated manually).
    case partial
    /// The platform has no programmatic rotation API. The user generates the
    /// new value in the provider's UI and imports it; Autorotate then
    /// propagates it to every configured target.
    case updateOnly
}

// MARK: - Rotation policy

/// Per-secret rotation policy.
public struct RotationPolicy: Codable, Sendable, Equatable {
    /// Hours between automatic rotations. Minimum enforced by the scheduler
    /// is 1 hour.
    public var intervalHours: Int
    /// Whether the scheduler may rotate this secret automatically when due.
    public var autoRotate: Bool
    /// Whether the VERIFY step performs a read-back from each target after
    /// the PUSH step.
    public var verifyAfterWrite: Bool
    /// Number of times a failed ROTATE/PUSH step is retried before the run
    /// is marked failed.
    public var maxRetries: Int

    public init(intervalHours: Int = 24 * 30,
                autoRotate: Bool = false,
                verifyAfterWrite: Bool = true,
                maxRetries: Int = 1) {
        self.intervalHours = max(1, intervalHours)
        self.autoRotate = autoRotate
        self.verifyAfterWrite = verifyAfterWrite
        self.maxRetries = max(0, maxRetries)
    }

    /// Returns the next due date given a rotation timestamp.
    public func nextDue(after lastRotatedAt: Date) -> Date {
        lastRotatedAt.addingTimeInterval(TimeInterval(intervalHours) * 3600)
    }
}

// MARK: - Secret status

/// Lifecycle status of a managed secret.
public enum SecretStatus: String, Codable, Sendable {
    /// Last rotation committed on all required targets.
    case active
    /// Never rotated yet (freshly registered).
    case pending
    /// Last run wrote some but not all required targets.
    case partial
    /// Last run failed before any target was updated.
    case failed
    /// Excluded from scheduling (kept for history).
    case disabled
}

// MARK: - Secret record

/// Metadata about ONE managed secret. **Never contains the plaintext value.**
public struct SecretRecord: Codable, Sendable, Identifiable, Equatable {
    public var id: UUID
    /// Human-readable secret name, e.g. `STRIPE_RESTRICTED_KEY`.
    public var name: String
    /// Connector id from `ConnectorRegistry`, e.g. `aws.iam`, `stripe`.
    public var connectorId: String
    /// Rotation policy.
    public var policy: RotationPolicy
    /// Destinations that receive the new value after rotation.
    public var targets: [TargetBinding]
    /// Current lifecycle status.
    public var status: SecretStatus
    /// Timestamp of the last committed (or partially committed) rotation.
    public var lastRotatedAt: Date?
    /// Monotonic version, incremented on every committed rotation.
    public var version: Int
    /// `sha256(value)[0:8]` of the current value — fingerprint only.
    public var fingerprint: String?
    /// Free-form note shown in the UI (never a secret value).
    public var note: String?
    public var createdAt: Date

    public init(id: UUID = UUID(),
                name: String,
                connectorId: String,
                policy: RotationPolicy = RotationPolicy(),
                targets: [TargetBinding] = [],
                status: SecretStatus = .pending,
                lastRotatedAt: Date? = nil,
                version: Int = 0,
                fingerprint: String? = nil,
                note: String? = nil,
                createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.connectorId = connectorId
        self.policy = policy
        self.targets = targets
        self.status = status
        self.lastRotatedAt = lastRotatedAt
        self.version = version
        self.fingerprint = fingerprint
        self.note = note
        self.createdAt = createdAt
    }

    /// Whether this record is due for rotation at `now`.
    public func isDue(at now: Date = Date()) -> Bool {
        guard policy.autoRotate, status != .disabled else { return false }
        guard let last = lastRotatedAt else { return true } // never rotated
        return policy.nextDue(after: last) <= now
    }
}

// MARK: - Rotation pipeline steps

/// The six pipeline steps, executed in order for every rotation run
/// (see `docs/architecture.md` §2).
public enum RotationStep: String, Codable, Sendable, CaseIterable {
    case lock
    case rotate
    case push
    case verify
    case commit
    case audit
}

/// Outcome of a single pipeline step.
public enum RotationStepStatus: String, Codable, Sendable {
    case succeeded
    case skipped
    case failed
}

/// Result of one pipeline step. `detail` must never contain secret values;
/// error messages are sanitized to remove credential material before being
/// stored here.
public struct RotationStepResult: Codable, Sendable, Identifiable {
    public var id: UUID
    public var step: RotationStep
    public var status: RotationStepStatus
    /// Which target this step result refers to (PUSH/VERIFY may produce one
    /// result per target). `nil` for single-instance steps.
    public var targetId: UUID?
    /// Short human-readable detail (sanitized, no secret material).
    public var detail: String?
    public var startedAt: Date
    public var finishedAt: Date

    public init(step: RotationStep,
                status: RotationStepStatus,
                targetId: UUID? = nil,
                detail: String? = nil,
                startedAt: Date,
                finishedAt: Date = Date()) {
        self.id = UUID()
        self.step = step
        self.status = status
        self.targetId = targetId
        self.detail = detail
        self.startedAt = startedAt
        self.finishedAt = finishedAt
    }
}

/// Terminal status of a rotation run.
public enum RotationRunStatus: String, Codable, Sendable {
    /// Still executing.
    case running
    /// All required targets updated; record committed.
    case committed
    /// Some required targets failed; old value kept where already written,
    /// rollback flagged via the audit entry.
    case partial
    /// Failed before or during PUSH; no target updated.
    case failed
    /// Skipped because another run holds the per-secret lock.
    case skippedLocked
}

/// One execution of the rotation pipeline for one secret, with per-step
/// results. Persisted by the app via `RotationRunStore`.
public struct RotationRun: Codable, Sendable, Identifiable {
    public var id: UUID
    public var secretId: UUID
    public var startedAt: Date
    public var finishedAt: Date?
    public var status: RotationRunStatus
    public var steps: [RotationStepResult]
    /// `sha256(newValue)[0:8]` — fingerprint of the value produced by this
    /// run, never the value itself.
    public var fingerprint: String?
    /// Whether the run was triggered by the scheduler (`auto`) or by a user
    /// (`manual`).
    public var trigger: RotationTrigger

    public enum RotationTrigger: String, Codable, Sendable {
        case manual
        case scheduled
    }

    public init(id: UUID = UUID(),
                secretId: UUID,
                startedAt: Date = Date(),
                finishedAt: Date? = nil,
                status: RotationRunStatus = .running,
                steps: [RotationStepResult] = [],
                fingerprint: String? = nil,
                trigger: RotationTrigger = .manual) {
        self.id = id
        self.secretId = secretId
        self.startedAt = startedAt
        self.finishedAt = finishedAt
        self.status = status
        self.steps = steps
        self.fingerprint = fingerprint
        self.trigger = trigger
    }
}

// MARK: - Audit

/// Auditable actions recorded in the immutable audit log.
public enum AuditAction: String, Codable, Sendable {
    case rotationStarted
    case rotationCommitted
    case rotationPartial
    case rotationFailed
    case rotationSkippedLocked
    case rollbackFlagged
    case secretRegistered
    case secretDeleted
    case targetUpdated
    case credentialStored
    case credentialDeleted
}

/// An immutable audit log entry.
///
/// Contains **fingerprints only**: `fingerprint` is the first 8 hex chars of
/// `sha256(secretValue)`. Plaintext values are never written to the audit
/// log (architecture.md §2 step 6, §6).
public struct AuditEntry: Codable, Sendable, Identifiable {
    public var id: UUID
    public var timestamp: Date
    /// Who/what performed the action: a username, `scheduler`, or `system`.
    public var actor: String
    public var action: AuditAction
    /// The secret this entry concerns, if any.
    public var secretId: UUID?
    /// The run this entry belongs to, if any.
    public var runId: UUID?
    /// `sha256(value)[0:8]` fingerprint — never the value.
    public var fingerprint: String?
    /// Structured, non-secret detail (target kind, connector id, step, ...).
    public var detail: [String: String]

    public init(id: UUID = UUID(),
                timestamp: Date = Date(),
                actor: String,
                action: AuditAction,
                secretId: UUID? = nil,
                runId: UUID? = nil,
                fingerprint: String? = nil,
                detail: [String: String] = [:]) {
        self.id = id
        self.timestamp = timestamp
        self.actor = actor
        self.action = action
        self.secretId = secretId
        self.runId = runId
        self.fingerprint = fingerprint
        self.detail = detail
    }
}

// MARK: - Target bindings

/// Kind of a rotation target. Mirrors the `targets.kind` column of the web
/// data model (architecture.md §7).
public enum TargetKind: String, Codable, Sendable, CaseIterable {
    case infisical
    case file
    case webhook
    case keychain
}

/// A destination that receives the new secret value after rotation.
///
/// Each case carries a Codable config struct. Bindings are persisted as part
/// of `SecretRecord.targets`.
public enum TargetBinding: Codable, Sendable, Identifiable, Equatable {
    /// Push to an Infisical project via REST v3 raw secrets.
    case infisical(InfisicalTargetConfig)
    /// Rewrite a key inside a local secret file (.env / JSON / YAML / TOML / INI).
    case file(FileTargetConfig)
    /// POST a JSON payload to an HTTPS webhook.
    case webhook(WebhookTargetConfig)
    /// Store in the Apple Keychain (generic password item).
    case keychain(KeychainTargetConfig)

    /// Stable identifier of the underlying config.
    public var id: UUID {
        switch self {
        case .infisical(let c): return c.id
        case .file(let c):      return c.id
        case .webhook(let c):   return c.id
        case .keychain(let c):  return c.id
        }
    }

    public var kind: TargetKind {
        switch self {
        case .infisical: return .infisical
        case .file:      return .file
        case .webhook:   return .webhook
        case .keychain:  return .keychain
        }
    }

    /// Whether this target participates in rotations. Disabled targets are
    /// skipped (and recorded as `skipped` step results).
    public var enabled: Bool {
        switch self {
        case .infisical(let c): return c.enabled
        case .file(let c):      return c.enabled
        case .webhook(let c):   return c.enabled
        case .keychain(let c):  return c.enabled
        }
    }

    /// Whether a failure of this target fails the whole run. All targets are
    /// required by default; optional targets turn a would-be `partial` run
    /// into `committed` when only they fail.
    public var required: Bool {
        switch self {
        case .infisical(let c): return c.required
        case .file(let c):      return c.required
        case .webhook(let c):   return c.required
        case .keychain(let c):  return c.required
        }
    }
}

// MARK: Target config structs

/// Configuration for an Infisical target.
///
/// Authentication material (Universal Auth clientSecret) is **not** stored
/// here — it lives in the Keychain under
/// `KeychainManager.credentialService` (see KeychainManager.swift).
public struct InfisicalTargetConfig: Codable, Sendable, Equatable {
    public var id: UUID
    public var enabled: Bool
    public var required: Bool
    /// Base URL of the Infisical instance. Default `https://app.infisical.com`.
    public var baseUrl: URL
    /// Infisical workspace (project) id.
    public var workspaceId: String
    /// Environment slug, e.g. `prod`, `dev`.
    public var environment: String
    /// Secret path inside the environment, e.g. `/` or `/backend`.
    public var secretPath: String
    /// Secret name inside Infisical (may differ from the record name).
    public var secretName: String

    public init(id: UUID = UUID(),
                enabled: Bool = true,
                required: Bool = true,
                baseUrl: URL = URL(string: "https://app.infisical.com")!,
                workspaceId: String,
                environment: String,
                secretPath: String = "/",
                secretName: String) {
        self.id = id
        self.enabled = enabled
        self.required = required
        self.baseUrl = baseUrl
        self.workspaceId = workspaceId
        self.environment = environment
        self.secretPath = secretPath
        self.secretName = secretName
    }
}

/// File formats understood by the file target engine.
public enum FileFormat: String, Codable, Sendable, CaseIterable {
    /// `KEY=value` dotenv files.
    case dotenv
    /// JSON, addressed with a dot-separated nested key path.
    case json
    /// YAML — flat keys only (see FileTargets.swift for limits).
    case yaml
    /// TOML — flat keys, optionally inside one `[table]` (see limits).
    case toml
    /// INI with `[section]` headers (e.g. `~/.aws/credentials` profiles).
    case ini
}

/// Configuration for a file target.
public struct FileTargetConfig: Codable, Sendable, Equatable {
    public var id: UUID
    public var enabled: Bool
    public var required: Bool
    /// Absolute path of the file on this device.
    public var path: String
    public var format: FileFormat
    /// Key to update. For `.json` a dot-separated nested path (`a.b.c`).
    /// For `.ini` the bare key — combine with `section`.
    public var keyPath: String
    /// INI section / AWS profile name, e.g. `default`. Ignored for other
    /// formats. For TOML, reused as the `[table]` to update within.
    public var section: String?

    public init(id: UUID = UUID(),
                enabled: Bool = true,
                required: Bool = true,
                path: String,
                format: FileFormat,
                keyPath: String,
                section: String? = nil) {
        self.id = id
        self.enabled = enabled
        self.required = required
        self.path = path
        self.format = format
        self.keyPath = keyPath
        self.section = section
    }
}

/// Configuration for a webhook target.
public struct WebhookTargetConfig: Codable, Sendable, Equatable {
    public var id: UUID
    public var enabled: Bool
    public var required: Bool
    /// HTTPS endpoint that receives the POST.
    public var url: URL
    /// Extra headers (e.g. authorization). Values may reference the secret
    /// fingerprint only — never the value.
    public var headers: [String: String]
    /// When `false` (default and recommended) the payload contains only
    /// `name`, `valueRef` (fingerprint + version) — no plaintext. When
    /// `true`, the plaintext value is included for receivers that need it.
    public var includeSecretValue: Bool

    public init(id: UUID = UUID(),
                enabled: Bool = true,
                required: Bool = true,
                url: URL,
                headers: [String: String] = [:],
                includeSecretValue: Bool = false) {
        self.id = id
        self.enabled = enabled
        self.required = required
        self.url = url
        self.headers = headers
        self.includeSecretValue = includeSecretValue
    }
}

/// Configuration for an Apple Keychain target.
public struct KeychainTargetConfig: Codable, Sendable, Equatable {
    public var id: UUID
    public var enabled: Bool
    public var required: Bool
    /// Keychain account (defaults to the secret name when created via the
    /// engine helper).
    public var account: String
    /// Service override. When `nil`, the engine uses
    /// `com.autorotate.<secretId>` per architecture.md §5.
    public var serviceOverride: String?
    /// Store with `kSecAttrSynchronizable = true` so the item syncs via
    /// iCloud Keychain — "if allowed" by entitlements / user settings.
    public var synchronizable: Bool

    public init(id: UUID = UUID(),
                enabled: Bool = true,
                required: Bool = true,
                account: String,
                serviceOverride: String? = nil,
                synchronizable: Bool = false) {
        self.id = id
        self.enabled = enabled
        self.required = required
        self.account = account
        self.serviceOverride = serviceOverride
        self.synchronizable = synchronizable
    }
}
