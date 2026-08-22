//
//  Stores+SwiftData.swift
//  TopSpin-iOS
//
//  SwiftData-backed implementations of TopSpinCore's storage protocols
//  (`SecretStore`, `AuditStore`, `RotationRunStore`) plus the app's
//  connector-configuration store.
//
//  STORAGE RULE (architecture.md §6): only metadata + fingerprints are
//  persisted. The `*Data` columns below carry JSON-encoded TopSpinCore value
//  types, none of which can contain a plaintext secret value. Plaintext
//  values flow provider → targets in memory only; admin credentials and the
//  Infisical clientSecret live exclusively in the Keychain.
//

import Foundation
import SwiftData
import TopSpinCore

// MARK: - SwiftData models

/// SwiftData row for a `SecretRecord` (the `secrets` table, §7).
///
/// The record is stored as a JSON blob (it is a Codable value type) with a
/// few scalar columns duplicated for sorting and `@Query` display without
/// decoding.
@Model
final class SDSecretRecord {
    @Attribute(.unique) var id: UUID
    var name: String
    var connectorId: String
    var statusRaw: String
    var lastRotatedAt: Date?
    var createdAt: Date
    /// JSON-encoded `SecretRecord` (metadata + fingerprint only).
    var recordData: Data

    init(record: SecretRecord) throws {
        self.id = record.id
        self.name = record.name
        self.connectorId = record.connectorId
        self.statusRaw = record.status.rawValue
        self.lastRotatedAt = record.lastRotatedAt
        self.createdAt = record.createdAt
        self.recordData = try JSONEncoder().encode(record)
    }

    /// Decodes the stored `SecretRecord`. Returns `nil` if the blob is
    /// from an incompatible schema version (defensive — never crashes UI).
    func toRecord() -> SecretRecord? {
        try? JSONDecoder().decode(SecretRecord.self, from: recordData)
    }

    /// Re-encodes after an update, keeping the scalar columns in sync.
    func apply(_ record: SecretRecord) throws {
        self.name = record.name
        self.connectorId = record.connectorId
        self.statusRaw = record.status.rawValue
        self.lastRotatedAt = record.lastRotatedAt
        self.recordData = try JSONEncoder().encode(record)
    }
}

/// SwiftData row for a `RotationRun` (the `rotationRuns` table).
@Model
final class SDRotationRun {
    @Attribute(.unique) var id: UUID
    var secretId: UUID
    var startedAt: Date
    var statusRaw: String
    var triggerRaw: String
    /// JSON-encoded `RotationRun` (per-step results + fingerprint only).
    var runData: Data

    init(run: RotationRun) throws {
        self.id = run.id
        self.secretId = run.secretId
        self.startedAt = run.startedAt
        self.statusRaw = run.status.rawValue
        self.triggerRaw = run.trigger.rawValue
        self.runData = try JSONEncoder().encode(run)
    }

    func toRun() -> RotationRun? {
        try? JSONDecoder().decode(RotationRun.self, from: runData)
    }

    func apply(_ run: RotationRun) throws {
        self.statusRaw = run.status.rawValue
        self.runData = try JSONEncoder().encode(run)
    }
}

/// SwiftData row for an `AuditEntry` (the append-only `auditLog` table).
@Model
final class SDAuditEntry {
    @Attribute(.unique) var id: UUID
    var timestamp: Date
    var actor: String
    var actionRaw: String
    /// JSON-encoded `AuditEntry` (fingerprints only, never values).
    var entryData: Data

    init(entry: AuditEntry) throws {
        self.id = entry.id
        self.timestamp = entry.timestamp
        self.actor = entry.actor
        self.actionRaw = entry.action.rawValue
        self.entryData = try JSONEncoder().encode(entry)
    }

    func toEntry() -> AuditEntry? {
        try? JSONDecoder().decode(AuditEntry.self, from: entryData)
    }
}

/// Per-secret connector configuration (`configJson`, mirroring the web
/// `connectors.configEnc` column — here unencrypted because it holds NO
/// secrets: account ids, project ids, template URLs. The admin credential
/// lives in the Keychain only).
@Model
final class SDConnectorConfig {
    @Attribute(.unique) var secretId: UUID
    var connectorId: String
    /// JSON-encoded `[String: String]` configuration map.
    var configData: Data

    init(secretId: UUID, connectorId: String, config: [String: String]) throws {
        self.secretId = secretId
        self.connectorId = connectorId
        self.configData = try JSONEncoder().encode(config)
    }

    func toConfig() -> [String: String] {
        (try? JSONDecoder().decode([String: String].self, from: configData)) ?? [:]
    }
}

// MARK: - Schema

enum TopSpinSchema {
    static let models: [any PersistentModel.Type] = [
        SDSecretRecord.self,
        SDRotationRun.self,
        SDAuditEntry.self,
        SDConnectorConfig.self
    ]

    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        return try ModelContainer(for: SDSecretRecord.self, SDRotationRun.self,
                                  SDAuditEntry.self, SDConnectorConfig.self,
                                  configurations: configuration)
    }
}

// MARK: - SecretStore

/// SwiftData-backed ``SecretStore``. Each operation runs against a fresh
/// `ModelContext` confined to this actor, so the store is fully `Sendable`
/// and safe for the engine to call off the main actor.
actor SwiftDataSecretStore: SecretStore {
    private let container: ModelContainer

    init(container: ModelContainer) {
        self.container = container
    }

    func allSecrets() async throws -> [SecretRecord] {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<SDSecretRecord>(
            sortBy: [SortDescriptor(\.createdAt)])
        return try context.fetch(descriptor).compactMap { $0.toRecord() }
    }

    func secret(id: UUID) async throws -> SecretRecord? {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<SDSecretRecord>(predicate: #Predicate { $0.id == id })
        return try context.fetch(descriptor).first?.toRecord()
    }

    func saveSecret(_ record: SecretRecord) async throws {
        let context = ModelContext(container)
        let id = record.id
        let descriptor = FetchDescriptor<SDSecretRecord>(predicate: #Predicate { $0.id == id })
        if let existing = try context.fetch(descriptor).first {
            try existing.apply(record)
        } else {
            context.insert(try SDSecretRecord(record: record))
        }
        try context.save()
    }

    func deleteSecret(id: UUID) async throws {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<SDSecretRecord>(predicate: #Predicate { $0.id == id })
        for model in try context.fetch(descriptor) {
            context.delete(model)
        }
        try context.save()
    }
}

// MARK: - RotationRunStore

/// SwiftData-backed ``RotationRunStore``.
actor SwiftDataRotationRunStore: RotationRunStore {
    private let container: ModelContainer

    init(container: ModelContainer) {
        self.container = container
    }

    func saveRun(_ run: RotationRun) async throws {
        let context = ModelContext(container)
        let id = run.id
        let descriptor = FetchDescriptor<SDRotationRun>(predicate: #Predicate { $0.id == id })
        if let existing = try context.fetch(descriptor).first {
            try existing.apply(run)
        } else {
            context.insert(try SDRotationRun(run: run))
        }
        try context.save()
    }

    func runs(secretId: UUID?, limit: Int) async throws -> [RotationRun] {
        let context = ModelContext(container)
        var descriptor: FetchDescriptor<SDRotationRun>
        if let secretId {
            descriptor = FetchDescriptor(
                predicate: #Predicate { $0.secretId == secretId },
                sortBy: [SortDescriptor(\.startedAt, order: .reverse)])
        } else {
            descriptor = FetchDescriptor(
                sortBy: [SortDescriptor(\.startedAt, order: .reverse)])
        }
        descriptor.fetchLimit = max(1, limit)
        return try context.fetch(descriptor).compactMap { $0.toRun() }
    }
}

// MARK: - AuditStore

/// SwiftData-backed append-only ``AuditStore`` (no update/delete paths).
actor SwiftDataAuditStore: AuditStore {
    private let container: ModelContainer

    init(container: ModelContainer) {
        self.container = container
    }

    func append(_ entry: AuditEntry) async throws {
        let context = ModelContext(container)
        context.insert(try SDAuditEntry(entry: entry))
        try context.save()
    }

    func recent(limit: Int) async throws -> [AuditEntry] {
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<SDAuditEntry>(
            sortBy: [SortDescriptor(\.timestamp, order: .reverse)])
        descriptor.fetchLimit = max(1, limit)
        return try context.fetch(descriptor).compactMap { $0.toEntry() }
    }
}

// MARK: - Connector configuration store

/// Loads/saves the per-secret connector configuration map. This store is
/// intentionally app-side: TopSpinCore's `RotationEngine` receives a
/// synchronous `connectorProvider` closure, so the app mirrors the SwiftData
/// rows into an in-memory, lock-protected cache (``ConnectorConfigCache``).
actor SwiftDataConnectorConfigStore {
    private let container: ModelContainer

    init(container: ModelContainer) {
        self.container = container
    }

    func save(secretId: UUID, connectorId: String, config: [String: String]) async throws {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<SDConnectorConfig>(
            predicate: #Predicate { $0.secretId == secretId })
        if let existing = try context.fetch(descriptor).first {
            existing.connectorId = connectorId
            existing.configData = try JSONEncoder().encode(config)
        } else {
            context.insert(try SDConnectorConfig(secretId: secretId,
                                                 connectorId: connectorId,
                                                 config: config))
        }
        try context.save()
    }

    func delete(secretId: UUID) async throws {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<SDConnectorConfig>(
            predicate: #Predicate { $0.secretId == secretId })
        for model in try context.fetch(descriptor) {
            context.delete(model)
        }
        try context.save()
    }

    func all() async throws -> [UUID: (connectorId: String, config: [String: String])] {
        let context = ModelContext(container)
        let rows = try context.fetch(FetchDescriptor<SDConnectorConfig>())
        var result: [UUID: (String, [String: String])] = [:]
        for row in rows {
            result[row.secretId] = (row.connectorId, row.toConfig())
        }
        return result
    }
}

/// Synchronous, thread-safe cache of connector configurations, consumed by
/// the engine's `@Sendable (SecretRecord) throws -> any SecretConnector`
/// closure (which cannot `await`). Kept in sync with
/// ``SwiftDataConnectorConfigStore`` by `AppModel`.
final class ConnectorConfigCache: @unchecked Sendable {
    private var storage: [UUID: (connectorId: String, config: [String: String])] = [:]
    private let lock = NSLock()

    func set(_ entries: [UUID: (connectorId: String, config: [String: String])]) {
        lock.lock()
        storage = entries
        lock.unlock()
    }

    func upsert(secretId: UUID, connectorId: String, config: [String: String]) {
        lock.lock()
        storage[secretId] = (connectorId, config)
        lock.unlock()
    }

    func remove(secretId: UUID) {
        lock.lock()
        storage[secretId] = nil
        lock.unlock()
    }

    func config(for secretId: UUID) -> (connectorId: String, config: [String: String])? {
        lock.lock()
        defer { lock.unlock() }
        return storage[secretId]
    }
}
