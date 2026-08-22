//
//  AppModel.swift
//  TopSpin-iOS
//
//  Central @Observable application model (@MainActor). Owns:
//  - the SwiftData stores backing TopSpinCore's store protocols,
//  - the `RotationEngine` actor and its dependency wiring,
//  - the KeychainManager (credential store + rotation target),
//  - user-facing actions (rotate now, add/delete secret, policy updates).
//
//  Views observe SwiftData directly via @Query for lists; AppModel performs
//  all writes and engine calls.
//

import Foundation
import SwiftData
import BackgroundTasks
import LocalAuthentication
import TopSpinCore

/// Input collected by the add-secret flow.
struct NewSecretDraft: Sendable {
    var name: String = ""
    var connectorId: String = ""
    var connectorConfig: [String: String] = [:]
    /// Admin credential — passed straight to the Keychain, never persisted
    /// anywhere else, never logged.
    var adminCredential: String = ""
    var policy: RotationPolicy = RotationPolicy()
    var targets: [TargetBinding] = []
    var note: String? = nil
}

@MainActor
@Observable
final class AppModel {

    // MARK: Dependencies

    let container: ModelContainer
    let settings: SettingsStorage

    private let secretStore: SwiftDataSecretStore
    private let runStore: SwiftDataRotationRunStore
    private let auditStore: SwiftDataAuditStore
    private let configStore: SwiftDataConnectorConfigStore
    private let configCache = ConnectorConfigCache()

    private(set) var keychain: KeychainManager
    private(set) var engine: RotationEngine

    // MARK: Observable UI state

    /// Ids of secrets with an in-flight manual rotation (drives spinners).
    private(set) var rotatingSecretIds: Set<UUID> = []
    /// Bumped whenever settings change so settings-driven views refresh.
    private(set) var settingsRevision: Int = 0
    /// True while a "rotate all due" pass is running.
    private(set) var isRotatingDueSecrets = false
    /// Last completed background refresh timestamp (mirrors UserDefaults).
    private(set) var lastBackgroundRefreshAt: Date?
    /// Whether biometrics/passcode authentication has succeeded this session.
    private(set) var isUnlocked: Bool = false

    /// Audit actor label for user-initiated actions.
    private let userActor = "user:ios"

    // MARK: Init

    /// @MainActor (inherited from the class). SwiftUI `App.init` may be
    /// main-actor-isolated, so the model can be built synchronously before
    /// launch completes for BGTaskScheduler registration.
    init(container: ModelContainer, settings: SettingsStorage = SettingsStorage()) {
        self.container = container
        self.settings = settings
        self.secretStore = SwiftDataSecretStore(container: container)
        self.runStore = SwiftDataRotationRunStore(container: container)
        self.auditStore = SwiftDataAuditStore(container: container)
        self.configStore = SwiftDataConnectorConfigStore(container: container)
        let keychain = Self.makeKeychain(settings: settings)
        self.keychain = keychain
        self.lastBackgroundRefreshAt = settings.lastBackgroundRefreshAt
        self.engine = Self.makeEngine(secretStore: secretStore,
                                      auditStore: auditStore,
                                      runStore: runStore,
                                      keychain: keychain,
                                      settings: settings,
                                      configCache: configCache)

        // Prime the synchronous connector-config cache from SwiftData.
        let store = configStore
        let cache = configCache
        Task {
            if let all = try? await store.all() {
                cache.set(all)
            }
        }
    }

    private nonisolated static func makeKeychain(settings: SettingsStorage) -> KeychainManager {
        if settings.useSharedAccessGroup {
            return KeychainManager(accessGroup: KeychainManager.sharedAccessGroup,
                                   defaultSynchronizable: settings.keychainSyncEnabled)
        }
        // App-private keychain: works before Keychain Sharing capabilities
        // are enabled in Xcode (development fallback, README §Entitlements).
        return KeychainManager(accessGroup: nil,
                               defaultSynchronizable: settings.keychainSyncEnabled)
    }

    private nonisolated static func makeEngine(
        secretStore: SwiftDataSecretStore,
        auditStore: SwiftDataAuditStore,
        runStore: SwiftDataRotationRunStore,
        keychain: KeychainManager,
        settings: SettingsStorage,
        configCache: ConnectorConfigCache
    ) -> RotationEngine {
        RotationEngine(dependencies: .init(
            secretStore: secretStore,
            auditStore: auditStore,
            runStore: runStore,
            credentialProvider: KeychainAdminCredentialProvider(keychain: keychain),
            connectorProvider: { record in
                guard let entry = configCache.config(for: record.id) else {
                    // No persisted config: fall back to a default instance for
                    // connectors that don't require one (updateOnly platforms),
                    // otherwise fail with a clear, sanitized error.
                    return try ConnectorFactory.makeConnector(connectorId: record.connectorId,
                                                              config: [:])
                }
                return try ConnectorFactory.makeConnector(connectorId: entry.connectorId,
                                                          config: entry.config)
            },
            infisicalClientProvider: { config in
                // Universal Auth per run: clientId comes from non-secret
                // settings, the clientSecret from the Keychain (§4, §5).
                let clientId = settings.infisicalClientId
                guard !clientId.isEmpty else {
                    throw InfisicalError.authenticationFailed(
                        "Universal Auth clientId is not configured (Settings → Infisical).")
                }
                let service = KeychainManager.infisicalClientSecretService(
                    workspaceId: config.workspaceId)
                let clientSecret = try keychain.read(account: clientId, service: service)
                return try await InfisicalClient(baseUrl: config.baseUrl)
                    .authenticate(clientId: clientId, clientSecret: clientSecret)
            },
            keychainWriter: keychain))
    }

    // MARK: - Settings actions

    /// Applies keychain-related settings changes (shared access group,
    /// iCloud sync default) by rebuilding the KeychainManager and engine.
    func applyKeychainSettings() {
        keychain = Self.makeKeychain(settings: settings)
        engine = Self.makeEngine(secretStore: secretStore,
                                 auditStore: auditStore,
                                 runStore: runStore,
                                 keychain: keychain,
                                 settings: settings,
                                 configCache: configCache)
        settingsRevision += 1
    }

    func noteSettingsChanged() {
        settingsRevision += 1
    }

    /// Saves the Infisical workspace config. A non-empty `clientSecret` is
    /// written to the Keychain only (account = clientId, service =
    /// com.topspin.infisical.<workspaceId>) and never touches UserDefaults.
    func saveInfisicalSettings(baseUrl: String, clientId: String,
                               workspaceId: String, environment: String,
                               clientSecret: String) throws {
        settings.infisicalBaseUrl = baseUrl
        settings.infisicalClientId = clientId
        settings.infisicalWorkspaceId = workspaceId
        settings.infisicalEnvironment = environment
        let trimmedSecret = clientSecret.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSecret.isEmpty {
            try keychain.save(value: trimmedSecret,
                              account: clientId,
                              service: KeychainManager.infisicalClientSecretService(workspaceId: workspaceId),
                              synchronizable: false) // never syncs off-device
        }
        settingsRevision += 1
    }

    func hasInfisicalClientSecret(workspaceId: String) -> Bool {
        let service = KeychainManager.infisicalClientSecretService(workspaceId: workspaceId)
        return keychain.exists(account: settings.infisicalClientId, service: service)
    }

    // MARK: - Secret actions

    /// Registers a new secret: stores the admin credential in the Keychain,
    /// the connector config + record metadata in SwiftData, and appends
    /// audit entries. The credential is never persisted anywhere else.
    func addSecret(_ draft: NewSecretDraft) async throws {
        let record = SecretRecord(name: draft.name,
                                  connectorId: draft.connectorId,
                                  policy: draft.policy,
                                  targets: draft.targets,
                                  note: draft.note)

        // 1. Admin credential → Keychain (only).
        if !draft.adminCredential.isEmpty {
            try keychain.storeAdminCredential(draft.adminCredential,
                                              connectorId: draft.connectorId,
                                              secretId: record.id)
        }

        // 2. Connector config + record → SwiftData (metadata only).
        try await configStore.save(secretId: record.id,
                                   connectorId: draft.connectorId,
                                   config: draft.connectorConfig)
        configCache.upsert(secretId: record.id,
                           connectorId: draft.connectorId,
                           config: draft.connectorConfig)
        try await secretStore.saveSecret(record)

        // 3. Audit.
        try? await auditStore.append(AuditEntry(
            actor: userActor, action: .secretRegistered, secretId: record.id,
            detail: ["connector": draft.connectorId, "name": record.name]))
        if !draft.adminCredential.isEmpty {
            try? await auditStore.append(AuditEntry(
                actor: userActor, action: .credentialStored, secretId: record.id,
                detail: ["connector": draft.connectorId, "location": "keychain"]))
        }
    }

    /// Deletes a secret record plus its connector config, admin credential
    /// and managed keychain value.
    func deleteSecret(_ record: SecretRecord) async throws {
        try await secretStore.deleteSecret(id: record.id)
        try await configStore.delete(secretId: record.id)
        configCache.remove(secretId: record.id)
        try? keychain.deleteAdminCredential(connectorId: record.connectorId, secretId: record.id)
        // Managed value item (only when TopSpin owns the default service).
        try? keychain.delete(account: record.name,
                             service: KeychainManager.service(forSecretId: record.id))
        try? await auditStore.append(AuditEntry(
            actor: userActor, action: .secretDeleted, secretId: record.id,
            detail: ["name": record.name]))
        try? await auditStore.append(AuditEntry(
            actor: userActor, action: .credentialDeleted, secretId: record.id,
            detail: ["connector": record.connectorId]))
    }

    func updatePolicy(for record: SecretRecord, policy: RotationPolicy) async throws {
        var updated = record
        updated.policy = policy
        try await secretStore.saveSecret(updated)
    }

    func updateTargets(for record: SecretRecord, targets: [TargetBinding]) async throws {
        var updated = record
        updated.targets = targets
        try await secretStore.saveSecret(updated)
        try? await auditStore.append(AuditEntry(
            actor: userActor, action: .targetUpdated, secretId: record.id,
            detail: ["targetCount": "\(targets.count)"]))
    }

    /// Replaces the admin credential for a secret (Keychain only).
    func updateAdminCredential(_ credential: String, for record: SecretRecord) throws {
        try keychain.storeAdminCredential(credential,
                                          connectorId: record.connectorId,
                                          secretId: record.id)
    }

    func hasAdminCredential(for record: SecretRecord) -> Bool {
        keychain.exists(account: record.connectorId,
                        service: KeychainManager.credentialService(connectorId: record.connectorId,
                                                                   secretId: record.id))
    }

    // MARK: - Rotation actions

    /// Manual "Rotate Now". For `updateOnly`/`partial` connectors the caller
    /// passes the value the user rotated in the provider UI
    /// (`importedValue`). Never throws for provider errors — the run's
    /// status carries the outcome.
    @discardableResult
    func rotateNow(_ record: SecretRecord, importedValue: String? = nil) async -> RotationRun {
        rotatingSecretIds.insert(record.id)
        defer { rotatingSecretIds.remove(record.id) }
        let run = await engine.rotate(secretId: record.id,
                                      actor: userActor,
                                      trigger: .manual,
                                      importedValue: importedValue)
        await notifyIfIssue(run: run, secretName: record.name)
        return run
    }

    /// Manual "Rotate all due" from the dashboard.
    func rotateDueSecretsNow() async {
        guard !isRotatingDueSecrets else { return }
        isRotatingDueSecrets = true
        defer { isRotatingDueSecrets = false }
        let names = await secretNamesById()
        let runs = await engine.rotateDueSecrets(actor: "scheduler")
        for run in runs {
            await notifyIfIssue(run: run, secretName: names[run.secretId] ?? "secret")
        }
    }

    // MARK: - Background refresh

    /// Entry point for the BGAppRefreshTask (`com.topspin.refresh`).
    func handleBackgroundRefresh(_ task: BGAppRefreshTask) {
        task.expirationHandler = { [weak task] in
            task?.setTaskCompleted(success: false)
        }
        Task { [weak self] in
            guard let self else { return }
            let names = await self.secretNamesById()
            let runs = await self.engine.rotateDueSecrets(actor: "scheduler")
            for run in runs {
                await self.notifyIfIssue(run: run, secretName: names[run.secretId] ?? "secret")
            }
            let failures = runs.filter { $0.status == .failed || $0.status == .partial }
            self.settings.lastBackgroundRefreshAt = Date()
            self.lastBackgroundRefreshAt = Date()
            BackgroundRotation.scheduleAppRefresh()
            task.setTaskCompleted(success: failures.isEmpty)
        }
    }

    // MARK: - Keychain inventory

    /// Snapshot of TopSpin-managed keychain items for Settings → Keychain.
    func keychainInventory() -> [KeychainItemInfo] {
        KeychainInventory.managedItems(accessGroup: keychain.accessGroup)
    }

    // MARK: - Helpers

    private func notifyIfIssue(run: RotationRun, secretName: String) async {
        guard run.status == .failed || run.status == .partial else { return }
        let detail = run.steps.last(where: { $0.status == .failed })?.detail
        await NotificationManager.notifyRotationIssue(secretName: secretName,
                                                      status: run.status,
                                                      detail: detail,
                                                      settings: settings)
    }

    // MARK: - Biometric Security
    @discardableResult
    func authenticateWithBiometrics() async -> Bool {
        guard settings.biometricsEnabled else {
            isUnlocked = true
            return true
        }
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            isUnlocked = true
            return true
        }
        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Unlock TopSpin to manage zero-plaintext secrets"
            )
            isUnlocked = success
            return success
        } catch {
            isUnlocked = false
            return false
        }
    }

    func lockApp() {
        if settings.biometricsEnabled {
            isUnlocked = false
        }
    }

    // MARK: - Batch .env Importer
    func importEnvBatch(items: [(name: String, connectorId: String, value: String, targetInfisical: Bool)]) async throws -> Int {
        var count = 0
        for item in items {
            var targets: [TargetBinding] = []
            if item.targetInfisical && settings.infisicalConfigured {
                targets.append(.infisical(workspaceId: settings.infisicalWorkspaceId,
                                          environment: settings.infisicalEnvironment,
                                          secretPath: "/",
                                          secretName: item.name))
            }

            let draft = NewSecretDraft(
                name: item.name,
                connectorId: item.connectorId,
                connectorConfig: [:],
                adminCredential: item.value,
                policy: RotationPolicy(),
                targets: targets,
                note: "Imported via .env Importer"
            )
            try await addSecret(draft)
            count += 1
        }
        return count
    }

    private func secretNamesById() async -> [UUID: String] {
        let records = (try? await secretStore.allSecrets()) ?? []
        return Dictionary(uniqueKeysWithValues: records.map { ($0.id, $0.name) })
    }
}

// MARK: - Sendable

/// All mutable UI state is @MainActor-confined; nonisolated members touch
/// only `Sendable` dependencies (actors, structs, the lock-guarded cache).
/// This lets the @Sendable BGTaskScheduler handler capture the model safely.
extension AppModel: @unchecked Sendable {}
