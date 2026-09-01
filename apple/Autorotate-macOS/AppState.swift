//
//  AppState.swift
//  Autorotate-macOS
//
//  Composition root: builds the SwiftData container, the AutorotateCore stores,
//  the KeychainManager, the RotationEngine and the RotationService, and wires
//  the engine's provider closures to the app's persistence.
//
//  STORAGE RULE: AppState moves metadata + fingerprints only. The two places
//  plaintext touches this layer are (a) the admin-credential SecureField,
//  which goes straight into the Keychain, and (b) `rotateNow(importedValue:)`
//  which hands the user-imported value to the engine in memory.
//

import Foundation
import SwiftData
import AutorotateCore

/// Lock-protected in-memory mirror of the per-secret connector settings
/// dictionaries. The engine's `connectorProvider` closure is synchronous,
/// so settings (persisted in SwiftData) are mirrored here and refreshed
/// whenever the app saves a secret.
final class ConnectorSettingsCache: @unchecked Sendable {
    private var storage: [UUID: [String: String]] = [:]
    private let lock = NSLock()

    func set(_ config: [String: String], for id: UUID) {
        lock.lock()
        storage[id] = config
        lock.unlock()
    }

    func remove(_ id: UUID) {
        lock.lock()
        storage[id] = nil
        lock.unlock()
    }

    func config(for id: UUID) -> [String: String] {
        lock.lock()
        defer { lock.unlock() }
        return storage[id] ?? [:]
    }
}

/// Runs rotations on behalf of the UI, the menu bar and the scheduler.
///
/// Every pipeline run is wrapped in a `SecurityScope` holding
/// security-scoped access to all registered file-target bookmarks, so
/// `FileTargetEngine`'s plain-path writes succeed inside the sandbox.
@MainActor
@Observable
final class RotationService {

    /// Most recent runs, newest first (drives the menu bar run list).
    private(set) var recentRuns: [RotationRun] = []
    /// Whether a rotation batch is currently executing.
    private(set) var isRotating = false
    /// Last rotation-triggered error surfaced to the UI (sanitized).
    private(set) var lastError: String?

    let engine: RotationEngine

    private let bookmarkStore = BookmarkStore()
    private let fileTargets: FileTargetRepository
    private let secretStore: SwiftDataSecretStore
    private let runStore: SwiftDataRunStore

    init(engine: RotationEngine,
         fileTargets: FileTargetRepository,
         secretStore: SwiftDataSecretStore,
         runStore: SwiftDataRunStore) {
        self.engine = engine
        self.fileTargets = fileTargets
        self.secretStore = secretStore
        self.runStore = runStore
    }

    // MARK: - Manual rotation

    /// Rotates one secret on user demand. `importedValue` is the manually
    /// rotated value for update-only connectors (held in memory only).
    @discardableResult
    func rotateNow(secretId: UUID, importedValue: String? = nil) async -> RotationRun {
        isRotating = true
        defer { isRotating = false }
        let scope = await makeScope()
        defer { scope.end() }
        let run = await engine.rotate(secretId: secretId,
                                      actor: Self.actorName,
                                      trigger: .manual,
                                      importedValue: importedValue)
        await afterRuns([run])
        return run
    }

    /// Rotates every due secret now (menu bar button / scheduler tick).
    @discardableResult
    func rotateDueNow(triggerScheduled: Bool) async -> [RotationRun] {
        isRotating = true
        defer { isRotating = false }
        let scope = await makeScope()
        defer { scope.end() }
        // rotateDueSecrets always audits with the "scheduler" actor; manual
        // "Rotate due now" runs each due secret individually so the audit
        // trail reflects the real actor.
        let runs: [RotationRun]
        if triggerScheduled {
            runs = await engine.rotateDueSecrets()
        } else {
            var collected: [RotationRun] = []
            let due = (try? await engine.dueSecrets()) ?? []
            for record in due {
                guard ConnectorRegistry.capability(of: record.connectorId) != .updateOnly else { continue }
                let run = await engine.rotate(secretId: record.id,
                                              actor: Self.actorName,
                                              trigger: .manual)
                collected.append(run)
            }
            runs = collected
        }
        await afterRuns(runs)
        return runs
    }

    /// Refreshes the recent-run list (used on launch and after rotations).
    func refreshRecentRuns() async {
        recentRuns = (try? await runStore.runs(secretId: nil, limit: 8)) ?? recentRuns
    }

    // MARK: - Internals

    /// Audit actor identity for UI-initiated runs.
    private static var actorName: String {
        "user:\(NSUserName() ?? "local")"
    }

    /// Builds a security scope over every registered file target.
    private func makeScope() async -> SecurityScope {
        let bookmarks = (try? await fileTargets.allBookmarks()) ?? []
        var urls: [URL] = []
        for data in bookmarks {
            guard let resolved = try? bookmarkStore.resolve(data) else { continue }
            urls.append(resolved.url)
            if let refreshed = resolved.refreshedBookmark {
                // Best effort: persist refreshed bookmark for a stale one.
                try? await fileTargets.updateBookmark(path: resolved.url.path, bookmark: refreshed)
            }
        }
        return SecurityScope(urls: urls)
    }

    /// Post-run bookkeeping: refresh run history and per-file last-write status.
    private func afterRuns(_ runs: [RotationRun]) async {
        recentRuns = (try? await runStore.runs(secretId: nil, limit: 8)) ?? (runs + recentRuns)
        let secrets = (try? await secretStore.allSecrets()) ?? []
        try? await fileTargets.recordWriteOutcomes(runs: runs, secrets: secrets)
    }
}

// MARK: - AppState (composition root)

/// The app's dependency graph. One instance is created at launch and
/// injected into the environment of both the main window and the menu bar
/// extra.
@MainActor
@Observable
final class AppState {

    /// SwiftData schema shared by the window's `modelContainer` and the
    /// engine-side `@ModelActor` stores.
    static let schema = Schema([
        SecretEntity.self,
        RunEntity.self,
        AuditEntity.self,
        FileTargetEntity.self
    ])

    let container: ModelContainer
    let secretStore: SwiftDataSecretStore
    let runStore: SwiftDataRunStore
    let auditStore: SwiftDataAuditStore
    let fileTargetRepository: FileTargetRepository
    let keychain: KeychainManager
    let settings: AppSettings
    let rotationService: RotationService
    let scheduler: RotationScheduler

    private let settingsCache = ConnectorSettingsCache()

    /// Sidebar section the main window should navigate to (set by menu bar
    /// quick links; consumed and cleared by `MainWindowView`).
    var requestedSection: AppSection?

    init(inMemory: Bool = false) {
        let configuration = ModelConfiguration(schema: Self.schema, isStoredInMemoryOnly: inMemory)
        do {
            container = try ModelContainer(for: Self.schema, configurations: [configuration])
        } catch {
            fatalError("Autorotate could not open its SwiftData store: \(error)")
        }

        let secretStore = SwiftDataSecretStore(modelContainer: container)
        let runStore = SwiftDataRunStore(modelContainer: container)
        let auditStore = SwiftDataAuditStore(modelContainer: container)
        let fileTargets = FileTargetRepository(modelContainer: container)
        self.secretStore = secretStore
        self.runStore = runStore
        self.auditStore = auditStore
        self.fileTargetRepository = fileTargets

        let settings = AppSettings()
        self.settings = settings

        // Keychain: shared access group when entitled; the iCloud sync
        // preference only affects NEW keychain targets — admin credentials
        // and the Infisical clientSecret always stay device-local.
        let keychain = KeychainManager(accessGroup: KeychainManager.sharedAccessGroup,
                                       defaultSynchronizable: settings.iCloudKeychainSyncEnabled)
        self.keychain = keychain

        let cache = settingsCache
        let defaults = UserDefaults.standard
        let keychainForClosures = keychain

        let dependencies = RotationEngine.Dependencies(
            secretStore: secretStore,
            auditStore: auditStore,
            runStore: runStore,
            credentialProvider: KeychainCredentialProvider(keychain: keychainForClosures),
            connectorProvider: { record in
                try ConnectorFactory.makeConnector(for: record,
                                                   settings: cache.config(for: record.id))
            },
            infisicalClientProvider: { config in
                // Read non-secret config fresh from defaults (thread-safe);
                // the clientSecret comes from the Keychain, in memory only.
                let snapshot = AppSettings.currentInfisicalConfig(from: defaults)
                let clientSecret = try keychainForClosures.read(
                    account: snapshot.clientId,
                    service: KeychainManager.infisicalClientSecretService(
                        workspaceId: config.workspaceId))
                return try await InfisicalClient(baseUrl: config.baseUrl)
                    .authenticate(clientId: snapshot.clientId, clientSecret: clientSecret)
            },
            keychainWriter: keychainForClosures,
            fileTargets: FileTargetEngine(),
            http: HTTPClient())

        let engine = RotationEngine(dependencies: dependencies)
        self.rotationService = RotationService(engine: engine,
                                               fileTargets: fileTargets,
                                               secretStore: secretStore,
                                               runStore: runStore)
        self.scheduler = RotationScheduler(service: rotationService)

        // Warm the connector-settings cache, then start scheduling.
        Task { [weak self] in
            guard let self else { return }
            await self.warmSettingsCache()
            await self.rotationService.refreshRecentRuns()
            self.scheduler.start(intervalMinutes: self.settings.schedulerIntervalMinutes)
        }
    }

    /// Loads all persisted connector settings into the synchronous cache.
    private func warmSettingsCache() async {
        guard let entities = try? await secretStore.allSecrets() else { return }
        for record in entities {
            let config = (try? await secretStore.connectorConfig(for: record.id)) ?? [:]
            settingsCache.set(config, for: record.id)
        }
    }

    // MARK: - Secret management (used by the Secrets view)

    /// Registers a new managed secret: metadata to SwiftData, admin
    /// credential to the Keychain (device-local), audit entry appended.
    @discardableResult
    func registerSecret(name: String,
                        connectorId: String,
                        connectorConfig: [String: String],
                        adminCredential: String?,
                        policy: RotationPolicy,
                        note: String?) async throws -> SecretRecord {
        let record = SecretRecord(name: name,
                                  connectorId: connectorId,
                                  policy: policy,
                                  note: note?.isEmpty == true ? nil : note)
        try await secretStore.saveSecret(record)
        try await secretStore.saveConnectorConfig(connectorConfig, for: record.id)
        settingsCache.set(connectorConfig, for: record.id)
        if let adminCredential, !adminCredential.isEmpty {
            try keychain.storeAdminCredential(adminCredential,
                                              connectorId: connectorId,
                                              secretId: record.id)
        }
        try await auditStore.append(AuditEntry(
            actor: NSUserName() ?? "local",
            action: .secretRegistered,
            secretId: record.id,
            detail: ["connector": connectorId]))
        return record
    }

    /// Saves edits to a record (policy editor, target bindings) plus its
    /// connector settings and, optionally, a replacement admin credential.
    func saveSecretEdits(_ record: SecretRecord,
                         connectorConfig: [String: String],
                         newAdminCredential: String?) async throws {
        try await secretStore.saveSecret(record)
        try await secretStore.saveConnectorConfig(connectorConfig, for: record.id)
        settingsCache.set(connectorConfig, for: record.id)
        if let newAdminCredential, !newAdminCredential.isEmpty {
            try keychain.storeAdminCredential(newAdminCredential,
                                              connectorId: record.connectorId,
                                              secretId: record.id)
            try await auditStore.append(AuditEntry(
                actor: NSUserName() ?? "local",
                action: .credentialStored,
                secretId: record.id,
                detail: ["connector": record.connectorId]))
        }
    }

    /// Whether an admin credential exists for this secret (UI shows
    /// "stored" / "missing" — never the value).
    func hasAdminCredential(for record: SecretRecord) -> Bool {
        keychain.exists(account: record.connectorId,
                        service: KeychainManager.credentialService(connectorId: record.connectorId,
                                                                   secretId: record.id))
    }

    /// Deletes a record and its Keychain-held admin credential. Managed
    /// Keychain target values (`com.autorotate.<secretId>`) are removed too —
    /// the file/Infisical targets retain their last written values by design.
    func deleteSecret(_ record: SecretRecord) async throws {
        try await secretStore.deleteSecret(id: record.id)
        settingsCache.remove(record.id)
        try? keychain.deleteAdminCredential(connectorId: record.connectorId, secretId: record.id)
        try? keychain.delete(account: record.name,
                             service: KeychainManager.service(forSecretId: record.id))
        try await auditStore.append(AuditEntry(
            actor: NSUserName() ?? "local",
            action: .secretDeleted,
            secretId: record.id,
            detail: ["name": record.name, "connector": record.connectorId]))
    }

    // MARK: - Infisical clientSecret (Settings)

    /// Stores the Infisical Universal Auth clientSecret in the Keychain.
    /// The value never touches UserDefaults or SwiftData.
    func storeInfisicalClientSecret(_ secret: String) throws {
        try keychain.save(
            value: secret,
            account: settings.infisicalClientId,
            service: KeychainManager.infisicalClientSecretService(workspaceId: settings.infisicalWorkspaceId),
            synchronizable: false)
    }

    /// Whether a clientSecret is stored for the current workspace.
    func hasInfisicalClientSecret() -> Bool {
        keychain.exists(
            account: settings.infisicalClientId,
            service: KeychainManager.infisicalClientSecretService(workspaceId: settings.infisicalWorkspaceId))
    }

    func deleteInfisicalClientSecret() throws {
        try keychain.delete(
            account: settings.infisicalClientId,
            service: KeychainManager.infisicalClientSecretService(workspaceId: settings.infisicalWorkspaceId))
    }

    // MARK: - Audit chain verification

    /// Verifies the hash-chained audit log for Settings → Audit chain
    /// (AR-08: tamper evidence that is never checked at runtime is
    /// documentation, not a control).  Read-only — never rewrites entries;
    /// a broken or legacy-prefixed chain is surfaced, not repaired.
    func verifyAuditChain(limit: Int = 500) async throws -> AuditChainVerification {
        try await auditStore.verifyChain(limit: limit)
    }
}
