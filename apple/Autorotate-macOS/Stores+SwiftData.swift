//
//  Stores+SwiftData.swift
//  TopSpin-macOS
//
//  SwiftData-backed implementations of TopSpinCore's persistence protocols:
//
//    - `SwiftDataSecretStore`   → `SecretStore`
//    - `SwiftDataRunStore`      → `RotationRunStore`
//    - `SwiftDataAuditStore`    → `AuditStore` (append-only)
//
//  STORAGE RULE (hard requirement, architecture.md §6): these entities
//  persist metadata only — names, ids, policies, target bindings, statuses,
//  timestamps and `sha256(value)[0:8]` fingerprints. Plaintext secret values
//  are NEVER written to SwiftData; values flow provider → targets in memory
//  inside `RotationEngine` only. Admin credentials and the Infisical
//  clientSecret live in the Keychain (`KeychainManager`), not here.
//
//  Codable payloads (RotationPolicy, [TargetBinding], connector settings)
//  are stored as JSON `Data` columns: SwiftData cannot natively persist
//  enums with associated values, and JSON keeps the schema forward-compatible.
//
//  All stores use the `@ModelActor` macro: each gets its own `ModelContext`
//  bound to a serial executor, which satisfies the protocols' `Sendable`
//  requirement and keeps all SwiftData work off the main actor.
//

import Foundation
import SwiftData
import TopSpinCore

// MARK: - SwiftData entities

/// SwiftData row for one ``SecretRecord`` (metadata only — never a value).
@Model
final class SecretEntity {
    @Attribute(.unique) var id: UUID
    var name: String
    var connectorId: String
    /// JSON-encoded ``RotationPolicy``.
    var policyData: Data
    /// JSON-encoded `[TargetBinding]`.
    var targetsData: Data
    /// JSON-encoded `[String: String]` connector settings used by
    /// ``ConnectorFactory`` to instantiate the connector at rotation time.
    var connectorConfigData: Data
    /// Raw value of ``SecretStatus``.
    var statusRaw: String
    var lastRotatedAt: Date?
    var version: Int
    /// `sha256(value)[0:8]` — fingerprint only.
    var fingerprint: String?
    var note: String?
    var createdAt: Date

    init(record: SecretRecord, connectorConfig: [String: String] = [:]) {
        self.id = record.id
        self.name = record.name
        self.connectorId = record.connectorId
        self.policyData = (try? JSONEncoder().encode(record.policy)) ?? Data()
        self.targetsData = (try? JSONEncoder().encode(record.targets)) ?? Data()
        self.connectorConfigData = (try? JSONEncoder().encode(connectorConfig)) ?? Data()
        self.statusRaw = record.status.rawValue
        self.lastRotatedAt = record.lastRotatedAt
        self.version = record.version
        self.fingerprint = record.fingerprint
        self.note = record.note
        self.createdAt = record.createdAt
    }

    /// Re-applies a mutated record (engine COMMIT step, UI edits).
    func apply(record: SecretRecord) {
        name = record.name
        connectorId = record.connectorId
        policyData = (try? JSONEncoder().encode(record.policy)) ?? policyData
        targetsData = (try? JSONEncoder().encode(record.targets)) ?? targetsData
        statusRaw = record.status.rawValue
        lastRotatedAt = record.lastRotatedAt
        version = record.version
        fingerprint = record.fingerprint
        note = record.note
    }

    /// Decodes back into the core model. Corrupt columns fall back to
    /// safe defaults rather than crashing the app.
    func toRecord() -> SecretRecord {
        let policy = (try? JSONDecoder().decode(RotationPolicy.self, from: policyData))
            ?? RotationPolicy()
        let targets = (try? JSONDecoder().decode([TargetBinding].self, from: targetsData)) ?? []
        return SecretRecord(
            id: id,
            name: name,
            connectorId: connectorId,
            policy: policy,
            targets: targets,
            status: SecretStatus(rawValue: statusRaw) ?? .pending,
            lastRotatedAt: lastRotatedAt,
            version: version,
            fingerprint: fingerprint,
            note: note,
            createdAt: createdAt)
    }

    /// Decoded connector settings dictionary.
    var connectorConfig: [String: String] {
        get { (try? JSONDecoder().decode([String: String].self, from: connectorConfigData)) ?? [:] }
        set { connectorConfigData = (try? JSONEncoder().encode(newValue)) ?? Data() }
    }
}

/// SwiftData row for one ``RotationRun`` (run history).
@Model
final class RunEntity {
    @Attribute(.unique) var id: UUID
    var secretId: UUID
    var startedAt: Date
    var finishedAt: Date?
    /// Raw value of ``RotationRunStatus``.
    var statusRaw: String
    /// JSON-encoded `[RotationStepResult]`.
    var stepsData: Data
    var fingerprint: String?
    /// Raw value of ``RotationRun/RotationTrigger``.
    var triggerRaw: String

    init(run: RotationRun) {
        self.id = run.id
        self.secretId = run.secretId
        self.startedAt = run.startedAt
        self.finishedAt = run.finishedAt
        self.statusRaw = run.status.rawValue
        self.stepsData = (try? JSONEncoder().encode(run.steps)) ?? Data()
        self.fingerprint = run.fingerprint
        self.triggerRaw = run.trigger.rawValue
    }

    func apply(run: RotationRun) {
        finishedAt = run.finishedAt
        statusRaw = run.status.rawValue
        stepsData = (try? JSONEncoder().encode(run.steps)) ?? stepsData
        fingerprint = run.fingerprint
    }

    func toRun() -> RotationRun {
        RotationRun(
            id: id,
            secretId: secretId,
            startedAt: startedAt,
            finishedAt: finishedAt,
            status: RotationRunStatus(rawValue: statusRaw) ?? .failed,
            steps: (try? JSONDecoder().decode([RotationStepResult].self, from: stepsData)) ?? [],
            fingerprint: fingerprint,
            trigger: RotationRun.RotationTrigger(rawValue: triggerRaw) ?? .manual)
    }
}

/// SwiftData row for one ``AuditEntry``. Append-only by design — no update
/// or delete path exists (architecture.md §2 step 6).
@Model
final class AuditEntity {
    @Attribute(.unique) var id: UUID
    var timestamp: Date
    var actor: String
    /// Raw value of ``AuditAction``.
    var actionRaw: String
    var secretId: UUID?
    var runId: UUID?
    var fingerprint: String?
    /// JSON-encoded `[String: String]` detail dictionary.
    var detailData: Data

    init(entry: AuditEntry) {
        self.id = entry.id
        self.timestamp = entry.timestamp
        self.actor = entry.actor
        self.actionRaw = entry.action.rawValue
        self.secretId = entry.secretId
        self.runId = entry.runId
        self.fingerprint = entry.fingerprint
        self.detailData = (try? JSONEncoder().encode(entry.detail)) ?? Data()
    }

    func toEntry() -> AuditEntry {
        AuditEntry(
            id: id,
            timestamp: timestamp,
            actor: actor,
            action: AuditAction(rawValue: actionRaw) ?? .rotationStarted,
            secretId: secretId,
            runId: runId,
            fingerprint: fingerprint,
            detail: (try? JSONDecoder().decode([String: String].self, from: detailData)) ?? [:])
    }
}

/// Outcome of the most recent rotation write to a file target.
enum FileTargetWriteStatus: String, Codable, Sendable {
    case succeeded
    case failed
}

/// A user-registered file target (`.env`, JSON, YAML, TOML, INI) with its
/// security-scoped bookmark so the sandboxed app retains read/write access
/// across launches (see `Bookmarks.swift` and the entitlements file).
///
/// The file's *contents* are never copied into the database — only the
/// bookmark blob, the display path, format metadata and last-write status.
@Model
final class FileTargetEntity {
    @Attribute(.unique) var id: UUID
    /// Security-scoped bookmark blob (`.withSecurityScope`).
    var bookmarkData: Data
    /// Last-known absolute path, for display and for engine writes.
    var displayPath: String
    /// Raw value of ``FileFormat``.
    var formatRaw: String
    var createdAt: Date
    var lastWriteAt: Date?
    /// Raw value of ``FileTargetWriteStatus``.
    var lastWriteStatusRaw: String?
    var lastWriteDetail: String?

    init(id: UUID = UUID(), bookmarkData: Data, displayPath: String, format: FileFormat) {
        self.id = id
        self.bookmarkData = bookmarkData
        self.displayPath = displayPath
        self.formatRaw = format.rawValue
        self.createdAt = Date()
    }

    var format: FileFormat {
        FileFormat(rawValue: formatRaw) ?? .dotenv
    }

    var lastWriteStatus: FileTargetWriteStatus? {
        get { lastWriteStatusRaw.flatMap(FileTargetWriteStatus.init(rawValue:)) }
        set { lastWriteStatusRaw = newValue?.rawValue }
    }
}

// MARK: - File format auto-detection

/// Detects the ``FileFormat`` of a picked/dropped file from its name.
enum FileFormatDetector {
    static func detect(url: URL) -> FileFormat {
        let filename = url.lastPathComponent.lowercased()
        // Exact filenames first: `.env`, `credentials`, …
        if filename == ".env" || filename == ".env.local" || filename == ".env.production"
            || filename == ".env.development" || filename.hasPrefix(".env.") {
            return .dotenv
        }
        if filename == "credentials" || filename == "config" {
            // ~/.aws/credentials, pip.conf-style INI files without extension.
            return .ini
        }
        switch url.pathExtension.lowercased() {
        case "env":           return .dotenv
        case "json":          return .json
        case "yaml", "yml":   return .yaml
        case "toml":          return .toml
        case "ini", "cfg", "conf": return .ini
        default:              return .dotenv
        }
    }

    /// Human-readable label for a format.
    static func label(_ format: FileFormat) -> String {
        switch format {
        case .dotenv: return ".env"
        case .json:   return "JSON"
        case .yaml:   return "YAML"
        case .toml:   return "TOML"
        case .ini:    return "INI"
        }
    }
}

// MARK: - SecretStore (SwiftData)

/// SwiftData-backed ``SecretStore``.
@ModelActor
actor SwiftDataSecretStore: SecretStore {

    func allSecrets() async throws -> [SecretRecord] {
        let descriptor = FetchDescriptor<SecretEntity>(
            sortBy: [SortDescriptor(\.createdAt, order: .forward)])
        return try modelContext.fetch(descriptor).map { $0.toRecord() }
    }

    func secret(id: UUID) async throws -> SecretRecord? {
        try fetchEntity(id: id)?.toRecord()
    }

    func saveSecret(_ record: SecretRecord) async throws {
        if let entity = try fetchEntity(id: record.id) {
            entity.apply(record: record)
        } else {
            modelContext.insert(SecretEntity(record: record))
        }
        try modelContext.save()
    }

    func deleteSecret(id: UUID) async throws {
        if let entity = try fetchEntity(id: id) {
            modelContext.delete(entity)
            try modelContext.save()
        }
    }

    // MARK: App-facing helpers (not part of the protocol)

    /// Persists connector settings alongside the record's metadata. The
    /// settings dictionary is non-secret configuration (user names, project
    /// ids, …); admin credentials go to the Keychain instead.
    func saveConnectorConfig(_ config: [String: String], for secretId: UUID) throws {
        if let entity = try fetchEntity(id: secretId) {
            entity.connectorConfig = config
            try modelContext.save()
        }
    }

    /// Connector settings for one secret (used by `connectorProvider`).
    func connectorConfig(for secretId: UUID) throws -> [String: String] {
        try fetchEntity(id: secretId)?.connectorConfig ?? [:]
    }

    private func fetchEntity(id: UUID) throws -> SecretEntity? {
        var descriptor = FetchDescriptor<SecretEntity>(
            predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return try modelContext.fetch(descriptor).first
    }
}

// MARK: - RotationRunStore (SwiftData)

/// SwiftData-backed ``RotationRunStore``.
@ModelActor
actor SwiftDataRunStore: RotationRunStore {

    func saveRun(_ run: RotationRun) async throws {
        let runId = run.id
        var descriptor = FetchDescriptor<RunEntity>(
            predicate: #Predicate { $0.id == runId })
        descriptor.fetchLimit = 1
        if let entity = try modelContext.fetch(descriptor).first {
            entity.apply(run: run)
        } else {
            modelContext.insert(RunEntity(run: run))
        }
        try modelContext.save()
    }

    func runs(secretId: UUID?, limit: Int) async throws -> [RotationRun] {
        var descriptor: FetchDescriptor<RunEntity>
        if let secretId {
            descriptor = FetchDescriptor<RunEntity>(
                predicate: #Predicate { $0.secretId == secretId },
                sortBy: [SortDescriptor(\.startedAt, order: .reverse)])
        } else {
            descriptor = FetchDescriptor<RunEntity>(
                sortBy: [SortDescriptor(\.startedAt, order: .reverse)])
        }
        descriptor.fetchLimit = max(0, limit)
        return try modelContext.fetch(descriptor).map { $0.toRun() }
    }
}

// MARK: - AuditStore (SwiftData, append-only)

/// SwiftData-backed ``AuditStore``. Implements append + read only; there is
/// deliberately no update/delete API (immutable audit log).
@ModelActor
actor SwiftDataAuditStore: AuditStore {

    func append(_ entry: AuditEntry) async throws {
        modelContext.insert(AuditEntity(entry: entry))
        try modelContext.save()
    }

    func recent(limit: Int) async throws -> [AuditEntry] {
        var descriptor = FetchDescriptor<AuditEntity>(
            sortBy: [SortDescriptor(\.timestamp, order: .reverse)])
        descriptor.fetchLimit = max(0, limit)
        return try modelContext.fetch(descriptor).map { $0.toEntry() }
    }
}

// MARK: - Managed keys & last-write inspection

/// One key inside a file target that a managed secret writes to.
struct ManagedKeyInfo: Identifiable, Sendable {
    var id: UUID { bindingId }
    let bindingId: UUID
    let secretId: UUID
    let secretName: String
    let keyPath: String
    let section: String?
    let enabled: Bool
    let required: Bool
}

/// Derives per-file UI state (managed keys, last write) from secret records
/// and run history. Pure functions over core models — no persistence.
enum FileTargetInspector {

    /// All key bindings across `records` that point at `path`.
    static func managedKeys(forPath path: String, in records: [SecretRecord]) -> [ManagedKeyInfo] {
        var keys: [ManagedKeyInfo] = []
        for record in records {
            for binding in record.targets {
                guard case .file(let config) = binding,
                      config.path == path else { continue }
                keys.append(ManagedKeyInfo(
                    bindingId: config.id,
                    secretId: record.id,
                    secretName: record.name,
                    keyPath: config.keyPath,
                    section: config.section,
                    enabled: config.enabled,
                    required: config.required))
            }
        }
        return keys.sorted { $0.secretName < $1.secretName }
    }

    /// Computes the last-write status for a file path by scanning recent
    /// runs' PUSH steps that reference one of the given binding ids.
    static func lastWrite(forPath path: String,
                          records: [SecretRecord],
                          runs: [RotationRun])
        -> (date: Date, status: FileTargetWriteStatus, detail: String)? {
        let bindingIds = Set(managedKeys(forPath: path, in: records).map(\.bindingId))
        guard !bindingIds.isEmpty else { return nil }
        for run in runs where run.status != .running {
            for step in run.steps where step.step == .push {
                guard let targetId = step.targetId, bindingIds.contains(targetId) else { continue }
                let status: FileTargetWriteStatus = step.status == .succeeded ? .succeeded : .failed
                return (step.finishedAt, status, step.detail ?? step.status.rawValue)
            }
        }
        return nil
    }
}

// MARK: - File target repository (app-facing)

/// App-facing repository for registered file targets. The File Targets view
/// reads through `@Query` directly; rotation bookkeeping (bookmarks for
/// scoped access, last-write status) goes through this actor.
@ModelActor
actor FileTargetRepository {

    /// Bookmark blobs of every registered file target (used to build the
    /// `SecurityScope` around rotation runs).
    func allBookmarks() throws -> [Data] {
        try modelContext.fetch(FetchDescriptor<FileTargetEntity>()).map(\.bookmarkData)
    }

    /// (displayPath, bookmark) pairs for every registered target.
    func allTargets() throws -> [(path: String, bookmark: Data)] {
        try modelContext.fetch(FetchDescriptor<FileTargetEntity>()).map {
            ($0.displayPath, $0.bookmarkData)
        }
    }

    /// Records the outcome of a rotation's PUSH steps against the matching
    /// file targets (matched by binding targetId → config path).
    func recordWriteOutcomes(runs: [RotationRun], secrets: [SecretRecord]) throws {
        var outcomeByBindingId: [UUID: (date: Date, ok: Bool, detail: String?)] = [:]
        for run in runs where run.status != .running {
            for step in run.steps where step.step == .push {
                guard let targetId = step.targetId else { continue }
                outcomeByBindingId[targetId] = (step.finishedAt,
                                                step.status == .succeeded,
                                                step.detail)
            }
        }
        guard !outcomeByBindingId.isEmpty else { return }
        // Map binding ids to file paths.
        var pathByBinding: [UUID: String] = [:]
        for record in secrets {
            for binding in record.targets {
                if case .file(let config) = binding {
                    pathByBinding[config.id] = config.path
                }
            }
        }
        let entities = try modelContext.fetch(FetchDescriptor<FileTargetEntity>())
        for entity in entities {
            for (bindingId, path) in pathByBinding where path == entity.displayPath {
                guard let outcome = outcomeByBindingId[bindingId] else { continue }
                entity.lastWriteAt = outcome.date
                entity.lastWriteStatus = outcome.ok ? .succeeded : .failed
                entity.lastWriteDetail = outcome.detail
            }
        }
        try modelContext.save()
    }

    /// Persists a refreshed bookmark after a stale resolution.
    func updateBookmark(path: String, bookmark: Data) throws {
        let entities = try modelContext.fetch(FetchDescriptor<FileTargetEntity>())
        for entity in entities where entity.displayPath == path {
            entity.bookmarkData = bookmark
        }
        try modelContext.save()
    }
}
