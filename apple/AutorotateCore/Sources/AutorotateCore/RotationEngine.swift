//
//  RotationEngine.swift
//  AutorotateCore
//
//  The rotation pipeline actor (architecture.md §2):
//
//      LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT
//
//  - Per-secret locking: concurrent runs for the same secret are skipped.
//  - The new secret value exists only in memory for the duration of a run.
//  - Every step produces a ``RotationStepResult`` and terminal audit
//    entries carry `sha256(value)[0:8]` fingerprints only.
//

import Foundation

/// Abstraction over the Keychain target writer so the engine stays usable
/// on non-Darwin builds (tests, servers). ``KeychainManager`` conforms on
/// Apple platforms.
public protocol KeychainTargetWriter: Sendable {
    /// Upserts a managed secret value into the Keychain.
    func writeSecretValue(_ value: String,
                          account: String,
                          service: String,
                          synchronizable: Bool) throws
    /// Reads a managed secret value back (VERIFY step).
    func readSecretValue(account: String, service: String) throws -> String
}

#if canImport(Security)
extension KeychainManager: KeychainTargetWriter {
    public func writeSecretValue(_ value: String,
                                 account: String,
                                 service: String,
                                 synchronizable: Bool) throws {
        try save(value: value, account: account, service: service, synchronizable: synchronizable)
    }

    public func readSecretValue(account: String, service: String) throws -> String {
        try read(account: account, service: service)
    }
}
#endif

/// Runs the Autorotate rotation pipeline.
public actor RotationEngine {

    /// Everything the engine needs, injected by the app target.
    public struct Dependencies: Sendable {
        /// Metadata persistence (SwiftData/UserDefaults-backed by the app).
        public var secretStore: any SecretStore
        /// Append-only audit persistence.
        public var auditStore: any AuditStore
        /// Optional run-history persistence.
        public var runStore: (any RotationRunStore)?
        /// Supplies connector admin credentials (Keychain on native).
        public var credentialProvider: any AdminCredentialProvider
        /// Builds the connector instance for a record from the app's
        /// persisted connector configuration.
        public var connectorProvider: @Sendable (SecretRecord) throws -> any SecretConnector
        /// Returns an **authenticated** Infisical client for a target
        /// config (the app fetches the clientSecret from the Keychain and
        /// performs Universal Auth inside this closure).
        public var infisicalClientProvider: @Sendable (InfisicalTargetConfig) async throws -> InfisicalClient
        /// Keychain writer for keychain targets. `nil` disables keychain
        /// targets (they fail their PUSH step with a clear message).
        public var keychainWriter: (any KeychainTargetWriter)?
        /// File target engine.
        public var fileTargets: FileTargetEngine
        /// HTTP client for webhooks.
        public var http: HTTPClient

        public init(secretStore: any SecretStore,
                    auditStore: any AuditStore,
                    runStore: (any RotationRunStore)? = nil,
                    credentialProvider: any AdminCredentialProvider,
                    connectorProvider: @escaping @Sendable (SecretRecord) throws -> any SecretConnector,
                    infisicalClientProvider: @escaping @Sendable (InfisicalTargetConfig) async throws -> InfisicalClient,
                    keychainWriter: (any KeychainTargetWriter)? = nil,
                    fileTargets: FileTargetEngine = FileTargetEngine(),
                    http: HTTPClient = HTTPClient()) {
            self.secretStore = secretStore
            self.auditStore = auditStore
            self.runStore = runStore
            self.credentialProvider = credentialProvider
            self.connectorProvider = connectorProvider
            self.infisicalClientProvider = infisicalClientProvider
            self.keychainWriter = keychainWriter
            self.fileTargets = fileTargets
            self.http = http
        }
    }

    private let dependencies: Dependencies

    /// Ids of secrets with a run currently in progress (pipeline step LOCK).
    private var locks: Set<UUID> = []

    public init(dependencies: Dependencies) {
        self.dependencies = dependencies
    }

    // MARK: - Scheduler

    /// Returns the secrets whose policy makes them due at `now`
    /// (autoRotate on, not disabled, interval elapsed — or never rotated).
    public func dueSecrets(now: Date = Date()) async throws -> [SecretRecord] {
        try await dependencies.secretStore.allSecrets().filter { $0.isDue(at: now) }
    }

    /// Rotates every due secret sequentially. Called by the app's scheduler
    /// (BGTaskScheduler on iOS, timer/launchd-style wake on macOS).
    ///
    /// Update-only secrets are skipped: automatic rotation requires either a
    /// programmatic connector or a manually imported value.
    public func rotateDueSecrets(now: Date = Date(), actor: String = "scheduler") async -> [RotationRun] {
        guard let due = try? await dueSecrets(now: now) else { return [] }
        var runs: [RotationRun] = []
        for record in due {
            let capability = ConnectorRegistry.capability(of: record.connectorId)
            if capability == .updateOnly { continue }
            let run = await rotate(secretId: record.id, actor: actor, trigger: .scheduled)
            runs.append(run)
        }
        return runs
    }

    // MARK: - Pipeline

    /// Runs the full LOCK→ROTATE→PUSH→VERIFY→COMMIT→AUDIT pipeline for one
    /// secret.
    ///
    /// - Parameters:
    ///   - secretId: Record to rotate.
    ///   - actor: Audit actor (`user:<name>` or `scheduler`).
    ///   - trigger: Manual or scheduled.
    ///   - importedValue: For `updateOnly`/`partial` connectors, the value
    ///     the user rotated manually in the provider UI. When supplied it
    ///     takes precedence over programmatic rotation.
    /// - Returns: The completed run. Failures are reported via
    ///   `run.status` and per-step results — this method only throws for
    ///   infrastructure errors (store failures), never for provider errors.
    @discardableResult
    public func rotate(secretId: UUID,
                       actor: String,
                       trigger: RotationRun.RotationTrigger = .manual,
                       importedValue: String? = nil) async -> RotationRun {
        var run = RotationRun(secretId: secretId, trigger: trigger)

        // --------------------------------------------------------------
        // 1. LOCK — per-secret mutual exclusion.
        // --------------------------------------------------------------
        let lockStart = Date()
        guard !locks.contains(secretId) else {
            run.steps.append(RotationStepResult(
                step: .lock, status: .skipped,
                detail: "Another rotation run holds the lock for this secret.",
                startedAt: lockStart))
            run.status = .skippedLocked
            run.finishedAt = Date()
            await audit(actor: actor, action: .rotationSkippedLocked,
                        secretId: secretId, runId: run.id)
            await persist(run)
            return run
        }
        locks.insert(secretId)
        run.steps.append(RotationStepResult(
            step: .lock, status: .succeeded, startedAt: lockStart))
        defer { locks.remove(secretId) }

        await audit(actor: actor, action: .rotationStarted, secretId: secretId, runId: run.id)

        // --------------------------------------------------------------
        // Load the record + connector.
        // --------------------------------------------------------------
        do {
            guard let record = try await dependencies.secretStore.secret(id: secretId) else {
                throw PipelineError.recordMissing(secretId)
            }
            let connector = try dependencies.connectorProvider(record)

            // ------------------------------------------------------------
            // 2. ROTATE — produce the new value in memory.
            // ------------------------------------------------------------
            let rotateStart = Date()
            // Programmatic rotate mints (and often deactivates) the provider
            // credential before PUSH.  With nowhere to land the new value the
            // plaintext exists only in this stack frame — then it is discarded
            // while the old provider credential may already be dead.
            guard record.targets.contains(where: { $0.enabled }) else {
                run.steps.append(RotationStepResult(
                    step: .rotate, status: .failed,
                    detail: "No enabled target to receive the new value; refusing to rotate.",
                    startedAt: rotateStart))
                return await finish(run: &run, record: record, status: .failed,
                                    actor: actor, fingerprint: nil)
            }
            var newValue: String
            do {
                newValue = try await Self.withRetries(record.policy.maxRetries) {
                    if let importedValue, connector.capability != .programmatic {
                        let admin = (try? await dependencies.credentialProvider
                            .adminCredential(connectorId: record.connectorId, secretId: record.id)) ?? ""
                        return try await connector.validateImportedValue(importedValue,
                                                                         adminCredential: admin)
                    }
                    let admin = try await dependencies.credentialProvider
                        .adminCredential(connectorId: record.connectorId, secretId: record.id)
                    return try await connector.rotate(adminCredential: admin)
                }
                run.steps.append(RotationStepResult(
                    step: .rotate, status: .succeeded,
                    detail: "Connector \(record.connectorId) produced a new value.",
                    startedAt: rotateStart))
            } catch {
                run.steps.append(RotationStepResult(
                    step: .rotate, status: .failed,
                    detail: Self.sanitize(error), startedAt: rotateStart))
                return await finish(run: &run, record: record, status: .failed,
                                    actor: actor, fingerprint: nil)
            }

            let fingerprint = Fingerprint.of(newValue)
            run.fingerprint = fingerprint
            let newVersion = record.version + 1

            // ------------------------------------------------------------
            // 3. PUSH — write the new value to every enabled target.
            // ------------------------------------------------------------
            var pushOutcomes: [(target: TargetBinding, ok: Bool)] = []
            for target in record.targets {
                let start = Date()
                guard target.enabled else {
                    run.steps.append(RotationStepResult(
                        step: .push, status: .skipped, targetId: target.id,
                        detail: "Target \(target.kind.rawValue) disabled.", startedAt: start))
                    continue
                }
                do {
                    try await push(value: newValue, fingerprint: fingerprint,
                                   version: newVersion, record: record, to: target)
                    run.steps.append(RotationStepResult(
                        step: .push, status: .succeeded, targetId: target.id,
                        detail: "Pushed to \(target.kind.rawValue).", startedAt: start))
                    pushOutcomes.append((target, true))
                } catch {
                    run.steps.append(RotationStepResult(
                        step: .push, status: .failed, targetId: target.id,
                        detail: Self.sanitize(error), startedAt: start))
                    pushOutcomes.append((target, false))
                }
            }

            // ------------------------------------------------------------
            // 4. VERIFY — optional read-back per successfully pushed target.
            // ------------------------------------------------------------
            var verifyFailures: Set<UUID> = []
            if record.policy.verifyAfterWrite {
                for (target, pushed) in pushOutcomes where pushed {
                    let start = Date()
                    do {
                        let verified = try await verify(target: target,
                                                        expectedValue: newValue,
                                                        record: record)
                        if verified {
                            run.steps.append(RotationStepResult(
                                step: .verify, status: .succeeded, targetId: target.id,
                                detail: "Read-back matches on \(target.kind.rawValue).",
                                startedAt: start))
                        } else {
                            verifyFailures.insert(target.id)
                            run.steps.append(RotationStepResult(
                                step: .verify, status: .failed, targetId: target.id,
                                detail: "Read-back mismatch on \(target.kind.rawValue).",
                                startedAt: start))
                        }
                    } catch let error as PipelineError {
                        if case .verificationNotSupported = error {
                            run.steps.append(RotationStepResult(
                                step: .verify, status: .skipped, targetId: target.id,
                                detail: "No read-back for \(target.kind.rawValue) targets.",
                                startedAt: start))
                        } else {
                            verifyFailures.insert(target.id)
                            run.steps.append(RotationStepResult(
                                step: .verify, status: .failed, targetId: target.id,
                                detail: Self.sanitize(error), startedAt: start))
                        }
                    } catch {
                        verifyFailures.insert(target.id)
                        run.steps.append(RotationStepResult(
                            step: .verify, status: .failed, targetId: target.id,
                            detail: Self.sanitize(error), startedAt: start))
                    }
                }
            } else {
                run.steps.append(RotationStepResult(
                    step: .verify, status: .skipped,
                    detail: "verifyAfterWrite is disabled by policy.", startedAt: Date()))
            }

            // ------------------------------------------------------------
            // 5. COMMIT — roll the record forward or flag the run.
            // ------------------------------------------------------------
            let commitStart = Date()
            let requiredTargets = pushOutcomes.filter { $0.target.required }
            let requiredOK = requiredTargets.filter { $0.ok && !verifyFailures.contains($0.target.id) }
            let anyRequiredFailed = requiredTargets.contains { !$0.ok || verifyFailures.contains($0.target.id) }
            // Vacuous "all required targets OK" is not a commit: a secret whose
            // only enabled targets are optional must still land the value on at
            // least one of them.  Otherwise ROTATE already mutated the provider
            // and COMMIT would fingerprint a value that lives nowhere.
            let anyDelivered = pushOutcomes.contains {
                $0.ok && !verifyFailures.contains($0.target.id)
            }

            let terminalStatus: RotationRunStatus
            if !anyRequiredFailed && (!requiredTargets.isEmpty || anyDelivered) {
                var updated = record
                updated.lastRotatedAt = Date()
                updated.version = newVersion
                updated.fingerprint = fingerprint
                updated.status = .active
                try await dependencies.secretStore.saveSecret(updated)
                run.steps.append(RotationStepResult(
                    step: .commit, status: .succeeded,
                    detail: "Record committed at version \(newVersion).",
                    startedAt: commitStart))
                terminalStatus = .committed
            } else if !requiredOK.isEmpty {
                // Some required targets updated, some failed: keep the old
                // value where already written, flag rollback via audit.
                var updated = record
                updated.lastRotatedAt = Date()
                updated.version = newVersion
                updated.fingerprint = fingerprint
                updated.status = .partial
                try await dependencies.secretStore.saveSecret(updated)
                run.steps.append(RotationStepResult(
                    step: .commit, status: .failed,
                    detail: "PARTIAL: \(requiredOK.count)/\(requiredTargets.count) required targets updated; rollback flagged.",
                    startedAt: commitStart))
                await audit(actor: actor, action: .rollbackFlagged,
                            secretId: record.id, runId: run.id, fingerprint: fingerprint,
                            detail: ["reason": "partial-run",
                                     "updatedTargets": "\(requiredOK.count)",
                                     "failedTargets": "\(requiredTargets.count - requiredOK.count)"])
                terminalStatus = .partial
            } else {
                var updated = record
                updated.status = .failed
                try await dependencies.secretStore.saveSecret(updated)
                run.steps.append(RotationStepResult(
                    step: .commit, status: .failed,
                    detail: "No required target updated; record kept at version \(record.version).",
                    startedAt: commitStart))
                terminalStatus = .failed
            }

            return await finish(run: &run, record: record, status: terminalStatus,
                                actor: actor, fingerprint: fingerprint)
        } catch {
            // Infrastructure failure (record missing, store down, …).
            run.steps.append(RotationStepResult(
                step: .commit, status: .failed,
                detail: Self.sanitize(error), startedAt: Date()))
            run.status = .failed
            run.finishedAt = Date()
            await audit(actor: actor, action: .rotationFailed,
                        secretId: secretId, runId: run.id,
                        detail: ["error": Self.sanitize(error)])
            await persist(run)
            return run
        }
    }

    // MARK: - PUSH helpers

    private func push(value: String,
                      fingerprint: String,
                      version: Int,
                      record: SecretRecord,
                      to target: TargetBinding) async throws {
        switch target {
        case .infisical(let config):
            let client = try await dependencies.infisicalClientProvider(config)
            try await client.upsertSecret(name: config.secretName,
                                          value: value,
                                          workspaceId: config.workspaceId,
                                          environment: config.environment,
                                          secretPath: config.secretPath)
        case .file(let config):
            try dependencies.fileTargets.setValue(value, in: config)
        case .webhook(let config):
            let valueRef = "autorotate://secret/\(record.id.uuidString.lowercased())/versions/\(version)"
            var headers = config.headers
            headers["Accept"] = "application/json"
            let request = try HTTPClient.makeRequest(
                method: "POST",
                url: config.url,
                headers: headers,
                jsonBody: WebhookPayload(name: record.name,
                                         valueRef: valueRef,
                                         fingerprint: fingerprint,
                                         version: version,
                                         value: config.includeSecretValue ? value : nil))
            try await dependencies.http.send(request)
        case .keychain(let config):
            guard let writer = dependencies.keychainWriter else {
                throw PipelineError.keychainUnavailable
            }
            let service = config.serviceOverride ?? KeychainServiceNaming.service(forSecretId: record.id)
            try writer.writeSecretValue(value,
                                        account: config.account,
                                        service: service,
                                        synchronizable: config.synchronizable)
        }
    }

    // MARK: - VERIFY helpers

    private func verify(target: TargetBinding,
                        expectedValue: String,
                        record: SecretRecord) async throws -> Bool {
        switch target {
        case .infisical(let config):
            let client = try await dependencies.infisicalClientProvider(config)
            let secret = try await client.getSecret(name: config.secretName,
                                                    workspaceId: config.workspaceId,
                                                    environment: config.environment,
                                                    secretPath: config.secretPath)
            return secret.value == expectedValue
        case .file(let config):
            return try dependencies.fileTargets.getValue(from: config) == expectedValue
        case .keychain(let config):
            guard let writer = dependencies.keychainWriter else {
                throw PipelineError.keychainUnavailable
            }
            let service = config.serviceOverride ?? KeychainServiceNaming.service(forSecretId: record.id)
            return try writer.readSecretValue(account: config.account, service: service) == expectedValue
        case .webhook:
            // Webhooks have no read-back semantics.
            throw PipelineError.verificationNotSupported(TargetKind.webhook.rawValue)
        }
    }

    // MARK: - Completion helpers

    /// Finishes a run: sets status/timestamp, appends the terminal audit
    /// entry (step 6) and persists the run.
    private func finish(run: inout RotationRun,
                        record: SecretRecord,
                        status: RotationRunStatus,
                        actor: String,
                        fingerprint: String?) async -> RotationRun {
        run.status = status
        run.finishedAt = Date()

        // 6. AUDIT — terminal entry, fingerprint only.
        let action: AuditAction = switch status {
        case .committed: .rotationCommitted
        case .partial:   .rotationPartial
        case .failed:    .rotationFailed
        case .skippedLocked: .rotationSkippedLocked
        case .running:   .rotationStarted
        }
        await audit(actor: actor, action: action,
                    secretId: record.id, runId: run.id, fingerprint: fingerprint,
                    detail: ["version": "\(record.version + (status == .failed ? 0 : 1))",
                             "trigger": run.trigger.rawValue])
        let auditStart = Date()
        run.steps.append(RotationStepResult(
            step: .audit, status: .succeeded,
            detail: "Audit entry appended (fingerprint \(fingerprint ?? "none")).",
            startedAt: auditStart))
        await persist(run)
        return run
    }

    private func persist(_ run: RotationRun) async {
        try? await dependencies.runStore?.saveRun(run)
    }

    private func audit(actor: String,
                       action: AuditAction,
                       secretId: UUID,
                       runId: UUID?,
                       fingerprint: String? = nil,
                       detail: [String: String] = [:]) async {
        let entry = AuditEntry(actor: actor,
                               action: action,
                               secretId: secretId,
                               runId: runId,
                               fingerprint: fingerprint,
                               detail: detail)
        try? await dependencies.auditStore.append(entry)
    }

    /// Retries an async operation up to `retries` extra times.
    private static func withRetries<T>(_ retries: Int,
                                       _ operation: () async throws -> T) async throws -> T {
        var attemptsLeft = max(0, retries)
        while true {
            do {
                return try await operation()
            } catch {
                attemptsLeft -= 1
                if attemptsLeft < 0 { throw error }
                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s backoff
            }
        }
    }

    /// Strips anything that looks like secret material from an error
    /// message before it lands in run history or the audit log.
    static func sanitize(_ error: any Error) -> String {
        // Connector/HTTP errors already carry sanitized excerpts and never
        // include request bodies; we additionally truncate defensively.
        String(String(describing: error).prefix(300))
    }

    /// Engine-internal errors (never leak provider messages).
    enum PipelineError: Error, CustomStringConvertible {
        case recordMissing(UUID)
        case keychainUnavailable
        case verificationNotSupported(String)

        var description: String {
            switch self {
            case .recordMissing(let id): return "Secret record not found: \(id)"
            case .keychainUnavailable: return "Keychain target writer is not available on this build."
            case .verificationNotSupported(let kind): return "No read-back verification for \(kind) targets."
            }
        }
    }
}

/// JSON body POSTed to webhook targets (architecture.md §2 step 3):
/// `{name, valueRef}` plus fingerprint/version; `value` is null unless the
/// target explicitly opts into receiving plaintext.
public struct WebhookPayload: Encodable, Sendable {
    /// Name of the rotated secret.
    public let name: String
    /// Opaque reference: `autorotate://secret/<id>/versions/<version>`.
    public let valueRef: String
    /// `sha256(value)[0:8]` fingerprint.
    public let fingerprint: String
    /// New record version.
    public let version: Int
    /// Plaintext value — only when `WebhookTargetConfig.includeSecretValue`.
    public let value: String?
}

/// Service-name helper kept separate so the engine compiles without the
/// Security framework while matching ``KeychainManager``'s naming scheme.
public enum KeychainServiceNaming {
    /// Managed-secret service: `codes.autorotate.<secretId>` (architecture.md §5).
    public static func service(forSecretId secretId: UUID) -> String {
        "codes.autorotate.\(secretId.uuidString.lowercased())"
    }
}

