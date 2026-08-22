//
//  KeychainManager.swift
//  TopSpinCore
//
//  Apple Keychain wrapper (Security framework), serving two roles
//  (architecture.md §5):
//
//  1. **Credential store** — connector admin credentials and the Infisical
//     Universal Auth clientSecret live here, never on disk.
//  2. **Rotation target** — managed secret values can be pushed into the
//     Keychain as generic-password items.
//
//  ENTITLEMENTS REQUIRED
//  ---------------------
//  Keychain Sharing (access groups):
//    The app must enable the "Keychain Sharing" capability and list the
//    access group `$(AppIdentifierPrefix)com.topspin.shared` in its
//    entitlements file, e.g.:
//
//      <key>keychain-access-groups</key>
//      <array>
//        <string>$(AppIdentifierPrefix)com.topspin.shared</string>
//      </array>
//
//    Every app/extension that must share items (iOS app, macOS app,
//    widgets, extensions) must list the same group. When ``accessGroup`` is
//    nil, items are private to the calling app and no entitlement beyond the
//    default application-identifier group is needed.
//
//  iCloud Keychain (kSecAttrSynchronizable):
//    No special entitlement is required on iOS; on macOS 14+ the app needs
//    the Keychain Sharing capability enabled. Items are synchronized only
//    "if allowed": the user must have iCloud Keychain enabled in Settings.
//    If the entitlement/user setting is missing, SecItemAdd returns
//    errSecMissingEntitlement / errSecNotAvailable and the item should be
//    re-saved non-synchronizable (see ``save(value:account:service:synchronizable:)``
//    which performs this fallback automatically).
//
//  AVAILABILITY
//  ------------
//  Keychain Services exist only on Apple platforms; this whole file is
//  compiled under `#if canImport(Security)`.
//

#if canImport(Security)
import Foundation
import Security

/// Errors thrown by ``KeychainManager``.
public enum KeychainError: Error, Sendable, CustomStringConvertible {
    /// The queried item does not exist.
    case itemNotFound
    /// Duplicate item on add (the manager uses upsert semantics, so this is
    /// surfaced only in unusual races).
    case duplicateItem
    /// The app lacks the Keychain Sharing entitlement for the configured
    /// access group, or iCloud Keychain sync is not allowed.
    case missingEntitlement
    /// Item data could not be decoded as UTF-8.
    case invalidData
    /// Any other Security framework error, with the OSStatus.
    case unhandled(OSStatus)

    public var description: String {
        switch self {
        case .itemNotFound: return "Keychain item not found."
        case .duplicateItem: return "Keychain item already exists."
        case .missingEntitlement:
            return "Missing Keychain entitlement (access group or iCloud sync not allowed)."
        case .invalidData: return "Keychain item data is not valid UTF-8."
        case .unhandled(let status):
            return "Keychain error \(status): \(SecCopyErrorMessageString(status, nil) as String? ?? "unknown")"
        }
    }
}

/// Generic-password Keychain manager.
///
/// Default service naming (architecture.md §5):
/// - managed secret values: `codes.autorotate.<secretId>`
/// - connector admin credentials: `codes.autorotate.credential.<connectorId>.<secretId>`
///
/// All items use `kSecAttrAccessibleAfterFirstUnlock` so background
/// rotation (BGTaskScheduler / launch agents) works after first unlock but
/// items are not exposed while the device is locked-and-never-unlocked.
public struct KeychainManager: Sendable {

    /// Shared access group used by all Autorotate apps/extensions.
    /// Requires the Keychain Sharing entitlement
    /// `$(AppIdentifierPrefix)codes.autorotate.shared` — see the file header.
    public static let sharedAccessGroup = "codes.autorotate.shared"

    /// Access group added to every query. `nil` = app-private keychain.
    public let accessGroup: String?

    /// Default for the synchronizable flag when saving managed secrets.
    /// iCloud Keychain sync happens only "if allowed" by the user's iCloud
    /// settings; failures fall back to a local item automatically.
    public let defaultSynchronizable: Bool

    public init(accessGroup: String? = KeychainManager.sharedAccessGroup,
                defaultSynchronizable: Bool = false) {
        self.accessGroup = accessGroup
        self.defaultSynchronizable = defaultSynchronizable
    }

    // MARK: - Service naming

    /// Service name for a managed secret value: `codes.autorotate.<secretId>`.
    public static func service(forSecretId secretId: UUID) -> String {
        "codes.autorotate.\(secretId.uuidString.lowercased())"
    }

    /// Service name for a connector admin credential:
    /// `codes.autorotate.credential.<connectorId>.<secretId>`.
    ///
    /// Admin credentials are scoped per secret record so that two secrets on
    /// the same platform can use different admin credentials.
    public static func credentialService(connectorId: String, secretId: UUID) -> String {
        "codes.autorotate.credential.\(connectorId).\(secretId.uuidString.lowercased())"
    }

    /// Service name for the Infisical Universal Auth clientSecret belonging
    /// to a given Infisical configuration.
    public static func infisicalClientSecretService(workspaceId: String) -> String {
        "codes.autorotate.infisical.\(workspaceId)"
    }


    // MARK: - Query building

    /// Builds the item-matching portion of a query (class + service +
    /// account + access group). `kSecAttrAccessible` is deliberately NOT
    /// included: it is a write-time attribute, not a search attribute.
    private func baseQuery(service: String, account: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    // MARK: - CRUD

    /// Saves (or updates) a generic-password item — upsert semantics.
    ///
    /// - Parameters:
    ///   - value: The plaintext value. Held in memory only.
    ///   - account: Keychain account (typically the secret name).
    ///   - service: Keychain service (see ``service(forSecretId:)``).
    ///   - synchronizable: If `true`, attempts to store with
    ///     `kSecAttrSynchronizable = true` (iCloud Keychain). When the sync
    ///     entitlement/user setting disallows it, automatically falls back
    ///     to a non-synchronizable local item.
    public func save(value: String,
                     account: String,
                     service: String,
                     synchronizable: Bool? = nil) throws {
        let data = Data(value.utf8)
        let sync = synchronizable ?? defaultSynchronizable
        var query = baseQuery(service: service, account: account)
        query[kSecValueData as String] = data
        // Write-time accessibility: readable after first unlock so
        // background rotation tasks work, locked before it.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        if sync {
            query[kSecAttrSynchronizable as String] = true
        }

        let status = SecItemAdd(query as CFDictionary, nil)
        switch status {
        case errSecSuccess:
            return
        case errSecDuplicateItem:
            try update(value: value, account: account, service: service, synchronizable: sync)
        case errSecMissingEntitlement where sync:
            // iCloud sync not allowed — retry as a local item ("if allowed").
            try save(value: value, account: account, service: service, synchronizable: false)
        case errSecMissingEntitlement:
            throw KeychainError.missingEntitlement
        default:
            throw KeychainError.unhandled(status)
        }
    }

    /// Updates an existing item's value.
    public func update(value: String,
                       account: String,
                       service: String,
                       synchronizable: Bool? = nil) throws {
        var query = baseQuery(service: service, account: account)
        // Match both local and synchronized copies of the item.
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        var attributes: [String: Any] = [kSecValueData as String: Data(value.utf8)]
        if let synchronizable {
            attributes[kSecAttrSynchronizable as String] = synchronizable
        }
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        switch status {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            throw KeychainError.itemNotFound
        case errSecMissingEntitlement:
            throw KeychainError.missingEntitlement
        default:
            throw KeychainError.unhandled(status)
        }
    }

    /// Reads an item's value. Used by the VERIFY pipeline step and when the
    /// engine fetches admin credentials.
    ///
    /// - Throws: ``KeychainError/itemNotFound`` when absent.
    public func read(account: String, service: String) throws -> String {
        var query = baseQuery(service: service, account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        // Match both local and synchronized copies.
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
                throw KeychainError.invalidData
            }
            return value
        case errSecItemNotFound:
            throw KeychainError.itemNotFound
        case errSecMissingEntitlement:
            throw KeychainError.missingEntitlement
        default:
            throw KeychainError.unhandled(status)
        }
    }

    /// Whether an item exists (both local and synchronized copies).
    public func exists(account: String, service: String) -> Bool {
        var query = baseQuery(service: service, account: account)
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    /// Deletes an item. Missing items are treated as success (idempotent).
    public func delete(account: String, service: String) throws {
        var query = baseQuery(service: service, account: account)
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        let status = SecItemDelete(query as CFDictionary)
        switch status {
        case errSecSuccess, errSecItemNotFound:
            return
        case errSecMissingEntitlement:
            throw KeychainError.missingEntitlement
        default:
            throw KeychainError.unhandled(status)
        }
    }

    // MARK: - Convenience: admin credentials

    /// Stores a connector admin credential in the Keychain. Called by the
    /// app when the user pastes an admin credential into the connector
    /// setup UI. Never synchronizable — admin credentials stay on-device.
    public func storeAdminCredential(_ credential: String,
                                     connectorId: String,
                                     secretId: UUID) throws {
        try save(value: credential,
                 account: connectorId,
                 service: Self.credentialService(connectorId: connectorId, secretId: secretId),
                 synchronizable: false)
    }

    /// Fetches a connector admin credential for a rotation run.
    public func adminCredential(connectorId: String, secretId: UUID) throws -> String {
        try read(account: connectorId,
                 service: Self.credentialService(connectorId: connectorId, secretId: secretId))
    }

    /// Deletes a connector admin credential (e.g. when a secret record is
    /// deleted). Also deletes nothing else — managed values use their own
    /// service namespace.
    public func deleteAdminCredential(connectorId: String, secretId: UUID) throws {
        try delete(account: connectorId,
                   service: Self.credentialService(connectorId: connectorId, secretId: secretId))
    }
}
#endif // canImport(Security)
