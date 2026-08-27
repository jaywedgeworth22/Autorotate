//
//  Stores.swift
//  AutorotateCore
//
//  Storage protocols. AutorotateCore deliberately takes NO persistence
//  dependency: the iOS/macOS app targets back these protocols with
//  SwiftData, UserDefaults, or plain files (mirroring the web app's
//  Drizzle/MySQL tables — architecture.md §7).
//
//  STORAGE RULE: implementations must persist metadata only. None of these
//  protocols accepts a plaintext secret value.
//

import Foundation

// MARK: - SecretStore

/// Persistence for ``SecretRecord`` metadata (the `secrets` table).
public protocol SecretStore: Sendable {
    /// All stored secret records.
    func allSecrets() async throws -> [SecretRecord]
    /// Fetches one record by id. Returns `nil` when unknown.
    func secret(id: UUID) async throws -> SecretRecord?
    /// Inserts or updates a record.
    func saveSecret(_ record: SecretRecord) async throws
    /// Deletes a record. Deleting a record never deletes Keychain items;
    /// the app should clean credentials via `KeychainManager` separately.
    func deleteSecret(id: UUID) async throws
}

// MARK: - RotationRunStore

/// Persistence for ``RotationRun`` history (the `rotationRuns` table).
public protocol RotationRunStore: Sendable {
    /// Inserts or updates a run.
    func saveRun(_ run: RotationRun) async throws
    /// Recent runs, newest first. `secretId` filters to one secret.
    func runs(secretId: UUID?, limit: Int) async throws -> [RotationRun]
}

// MARK: - AuditStore

/// Append-only persistence for ``AuditEntry`` (the `auditLog` table).
///
/// Implementations should treat the log as immutable: append and read only,
/// no update/delete. Entries contain fingerprints only, never values.
public protocol AuditStore: Sendable {
    /// Appends an immutable entry.
    func append(_ entry: AuditEntry) async throws
    /// Recent entries, newest first.
    func recent(limit: Int) async throws -> [AuditEntry]
}

// MARK: - CredentialProvider

/// Supplies connector admin credentials to the rotation engine.
///
/// On native apps this is backed by ``KeychainManager``; a closure-based
/// adapter is provided so tests and the web server can supply credentials
/// differently (the web server decrypts from its DB instead —
/// architecture.md §5).
public protocol AdminCredentialProvider: Sendable {
    /// Returns the admin credential for rotating `secret` via `connectorId`.
    /// - Throws: ``ConnectorError/invalidCredential(_:)`` when absent.
    func adminCredential(connectorId: String, secretId: UUID) async throws -> String
}

#if canImport(Security)
/// Keychain-backed credential provider (the native default).
public struct KeychainCredentialProvider: AdminCredentialProvider {
    private let keychain: KeychainManager

    public init(keychain: KeychainManager) {
        self.keychain = keychain
    }

    public func adminCredential(connectorId: String, secretId: UUID) async throws -> String {
        do {
            return try keychain.adminCredential(connectorId: connectorId, secretId: secretId)
        } catch {
            throw ConnectorError.invalidCredential(
                "No admin credential in Keychain for connector '\(connectorId)'.")
        }
    }
}
#endif

/// Closure-backed credential provider — handy for tests and server-side
/// adapters.
public struct ClosureCredentialProvider: AdminCredentialProvider {
    private let handler: @Sendable (String, UUID) async throws -> String

    public init(_ handler: @escaping @Sendable (String, UUID) async throws -> String) {
        self.handler = handler
    }

    public func adminCredential(connectorId: String, secretId: UUID) async throws -> String {
        try await handler(connectorId, secretId)
    }
}

// MARK: - In-memory reference implementations

/// Thread-safe in-memory ``SecretStore``. Useful for tests, previews and
/// the demo mode; apps should provide SwiftData-backed stores in
/// production.
public actor InMemorySecretStore: SecretStore {
    private var records: [UUID: SecretRecord] = [:]

    public init() {}

    public func allSecrets() async throws -> [SecretRecord] {
        records.values.sorted { $0.createdAt < $1.createdAt }
    }

    public func secret(id: UUID) async throws -> SecretRecord? {
        records[id]
    }

    public func saveSecret(_ record: SecretRecord) async throws {
        records[record.id] = record
    }

    public func deleteSecret(id: UUID) async throws {
        records[id] = nil
    }
}

/// Thread-safe in-memory ``RotationRunStore``.
public actor InMemoryRotationRunStore: RotationRunStore {
    private var storage: [UUID: RotationRun] = [:]

    public init() {}

    public func saveRun(_ run: RotationRun) async throws {
        storage[run.id] = run
    }

    public func runs(secretId: UUID?, limit: Int) async throws -> [RotationRun] {
        let filtered = storage.values.filter { secretId == nil || $0.secretId == secretId }
        return Array(filtered.sorted { $0.startedAt > $1.startedAt }.prefix(max(0, limit)))
    }
}

/// Thread-safe in-memory append-only ``AuditStore``.
public actor InMemoryAuditStore: AuditStore {
    private var entries: [AuditEntry] = []

    public init() {}

    public func append(_ entry: AuditEntry) async throws {
        entries.append(entry)
    }

    public func recent(limit: Int) async throws -> [AuditEntry] {
        Array(entries.suffix(max(0, limit)).reversed())
    }
}
