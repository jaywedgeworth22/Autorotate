//
//  KeychainManager.swift
//  AutorotateCore
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
//    access group `$(AppIdentifierPrefix)com.autorotate.shared` in its
//    entitlements file, e.g.:
//
//      <key>keychain-access-groups</key>
//      <array>
//        <string>$(AppIdentifierPrefix)com.autorotate.shared</string>
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
//  DATA-PROTECTION KEYCHAIN (kSecUseDataProtectionKeychain)
//  --------------------------------------------------------
//  Every query below sets `kSecUseDataProtectionKeychain: true`. On iOS this
//  is the only keychain and the flag is a no-op; on macOS, omitting it sends
//  `kSecClassGenericPassword` items to the **legacy file-based keychain**,
//  which ignores `kSecAttrAccessible`, treats access groups differently, and
//  does not participate in iCloud Keychain sync. Three documented behaviours
//  therefore silently failed on macOS: the shared
//  `codes.autorotate.shared` access group (architecture.md §5),
//  `kSecAttrAccessibleAfterFirstUnlock` for unattended scheduled rotation,
//  and iCloud sync.
//
//  Turning the flag on relocates storage, so existing macOS installs need a
//  migration rather than a flag flip. ``KeychainManager`` migrates lazily:
//  when a read misses in the data-protection keychain it repeats the query
//  against the legacy keychain and, on a hit, writes the item into the
//  data-protection keychain **first** and only then removes the legacy copy.
//  If the write fails the legacy item is left exactly where it was, so no
//  path through the migration can lose an item; if the delete fails, both
//  copies exist and the data-protection copy wins every subsequent read.
//
//  AVAILABILITY
//  ------------
//  Keychain Services exist only on Apple platforms; this whole file is
//  compiled under `#if canImport(Security)`.
//

#if canImport(Security)
import Foundation
import Security

// MARK: - Injectable Security backend

/// The four `SecItem*` entry points, injectable so the migration logic can
/// be unit-tested against an in-memory double instead of the real keychain
/// (which a test process cannot populate deterministically, and which needs
/// entitlements that `swift test` does not have).
///
/// Follows the closure-provider style already used for
/// ``ClosureCredentialProvider`` and `RotationEngine.Dependencies`.
public struct SecItemBackend: Sendable {
    public var add: @Sendable (CFDictionary, UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus
    public var copyMatching: @Sendable (CFDictionary, UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus
    public var update: @Sendable (CFDictionary, CFDictionary) -> OSStatus
    public var delete: @Sendable (CFDictionary) -> OSStatus

    public init(add: @escaping @Sendable (CFDictionary, UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus,
                copyMatching: @escaping @Sendable (CFDictionary, UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus,
                update: @escaping @Sendable (CFDictionary, CFDictionary) -> OSStatus,
                delete: @escaping @Sendable (CFDictionary) -> OSStatus) {
        self.add = add
        self.copyMatching = copyMatching
        self.update = update
        self.delete = delete
    }

    /// The real Security framework.
    public static let system = SecItemBackend(
        add: { SecItemAdd($0, $1) },
        copyMatching: { SecItemCopyMatching($0, $1) },
        update: { SecItemUpdate($0, $1) },
        delete: { SecItemDelete($0) })
}

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

    /// Whether a read that misses in the data-protection keychain falls back
    /// to the legacy macOS keychain and migrates what it finds. Defaults to
    /// `true`; set `false` for a fresh install that can never have legacy
    /// items, to skip one query on every genuine miss.
    public let migratesLegacyItems: Bool

    /// Security framework entry points. Injectable for tests.
    private let secItem: SecItemBackend

    public init(accessGroup: String? = KeychainManager.sharedAccessGroup,
                defaultSynchronizable: Bool = false,
                migratesLegacyItems: Bool = true,
                secItem: SecItemBackend = .system) {
        self.accessGroup = accessGroup
        self.defaultSynchronizable = defaultSynchronizable
        self.migratesLegacyItems = migratesLegacyItems
        self.secItem = secItem
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

    /// Which of the two macOS keychains a query addresses.
    ///
    /// On iOS there is only one keychain and both cases behave identically.
    private enum Keychain {
        /// The modern data-protection keychain — where every item belongs.
        case dataProtection
        /// The legacy macOS file-based keychain — read during migration
        /// only, never a write destination for new items.
        case legacy
    }

    /// Builds the item-matching portion of a query (class + service +
    /// account + access group + keychain selector). `kSecAttrAccessible` is
    /// deliberately NOT included: it is a write-time attribute, not a search
    /// attribute, and including it in a search silently narrows the match.
    private func baseQuery(service: String,
                           account: String,
                           in keychain: Keychain) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        switch keychain {
        case .dataProtection:
            // Required on macOS for access groups, kSecAttrAccessible and
            // iCloud sync to mean what the docs say. No-op on iOS.
            query[kSecUseDataProtectionKeychain as String] = true
            if let accessGroup {
                query[kSecAttrAccessGroup as String] = accessGroup
            }
        case .legacy:
            // The legacy keychain has no compatible notion of our access
            // group, so the group is omitted: a pre-migration item was
            // written without it.
            query[kSecUseDataProtectionKeychain as String] = false
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
        let sync = synchronizable ?? defaultSynchronizable
        let status = insert(value: value, account: account, service: service, synchronizable: sync)
        switch status {
        case errSecSuccess:
            // A legacy copy of the same item would now hold a stale value
            // and shadow nothing, so drop it. Best effort: failing to clean
            // up must not fail the save, and the data-protection copy wins
            // every read either way.
            discardLegacyCopy(account: account, service: service)
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

    /// Raw add into the data-protection keychain. Returns the `OSStatus` so
    /// callers can branch on duplicate/entitlement without a throw/catch.
    private func insert(value: String,
                        account: String,
                        service: String,
                        synchronizable: Bool) -> OSStatus {
        var query = baseQuery(service: service, account: account, in: .dataProtection)
        query[kSecValueData as String] = Data(value.utf8)
        // Write-time accessibility: readable after first unlock so
        // background rotation tasks work, locked before it.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        if synchronizable {
            query[kSecAttrSynchronizable as String] = true
        }
        return secItem.add(query as CFDictionary, nil)
    }

    /// Updates an existing item's value.
    ///
    /// When the item exists only in the legacy macOS keychain, the new value
    /// is written into the data-protection keychain and the legacy copy is
    /// then removed — the update doubles as the migration.
    public func update(value: String,
                       account: String,
                       service: String,
                       synchronizable: Bool? = nil) throws {
        var query = baseQuery(service: service, account: account, in: .dataProtection)
        // Match both local and synchronized copies of the item.
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        var attributes: [String: Any] = [kSecValueData as String: Data(value.utf8)]
        if let synchronizable {
            attributes[kSecAttrSynchronizable as String] = synchronizable
        }
        let status = secItem.update(query as CFDictionary, attributes as CFDictionary)
        switch status {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            // Nothing in the data-protection keychain. If a legacy item is
            // sitting there, promote it — carrying the NEW value, since that
            // is what the caller asked to store.
            guard migratesLegacyItems, legacyItem(account: account, service: service) != nil else {
                throw KeychainError.itemNotFound
            }
            let addStatus = insert(value: value,
                                   account: account,
                                   service: service,
                                   synchronizable: synchronizable ?? defaultSynchronizable)
            guard addStatus == errSecSuccess else {
                // Data-protection write failed: leave the legacy item alone
                // rather than losing the item.
                throw KeychainError.unhandled(addStatus)
            }
            discardLegacyCopy(account: account, service: service)
        case errSecMissingEntitlement:
            throw KeychainError.missingEntitlement
        default:
            throw KeychainError.unhandled(status)
        }
    }

    /// Reads an item's value. Used by the VERIFY pipeline step and when the
    /// engine fetches admin credentials.
    ///
    /// A miss in the data-protection keychain falls back to the legacy macOS
    /// keychain; a hit there is migrated (see the file header) and returned,
    /// so an install created before ``kSecUseDataProtectionKeychain`` was set
    /// keeps working and repairs itself one item at a time.
    ///
    /// - Throws: ``KeychainError/itemNotFound`` when absent from both.
    public func read(account: String, service: String) throws -> String {
        switch fetch(account: account, service: service, in: .dataProtection) {
        case .success(let value):
            return value
        case .failure(KeychainError.itemNotFound):
            guard migratesLegacyItems,
                  let legacy = legacyItem(account: account, service: service) else {
                throw KeychainError.itemNotFound
            }
            migrateFromLegacy(legacy, account: account, service: service)
            return legacy.value
        case .failure(let error):
            throw error
        }
    }

    /// Whether an item exists — either keychain, local or synchronized copy.
    public func exists(account: String, service: String) -> Bool {
        var query = baseQuery(service: service, account: account, in: .dataProtection)
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        if secItem.copyMatching(query as CFDictionary, nil) == errSecSuccess {
            return true
        }
        guard migratesLegacyItems else { return false }
        return legacyItem(account: account, service: service) != nil
    }

    /// Deletes an item from both keychains. Missing items are treated as
    /// success (idempotent).
    public func delete(account: String, service: String) throws {
        var query = baseQuery(service: service, account: account, in: .dataProtection)
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        let status = secItem.delete(query as CFDictionary)
        // A legacy copy must go too, or a deleted credential would come back
        // through the migration path on the next read.
        discardLegacyCopy(account: account, service: service)
        switch status {
        case errSecSuccess, errSecItemNotFound:
            return
        case errSecMissingEntitlement:
            throw KeychainError.missingEntitlement
        default:
            throw KeychainError.unhandled(status)
        }
    }

    // MARK: - Legacy keychain migration (macOS)

    /// An item found in the legacy keychain.
    private struct LegacyItem {
        let value: String
        let synchronizable: Bool
    }

    private func fetch(account: String,
                       service: String,
                       in keychain: Keychain) -> Result<String, Error> {
        var query = baseQuery(service: service, account: account, in: keychain)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        // Match both local and synchronized copies.
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny

        var item: CFTypeRef?
        let status = secItem.copyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
                return .failure(KeychainError.invalidData)
            }
            return .success(value)
        case errSecItemNotFound:
            return .failure(KeychainError.itemNotFound)
        case errSecMissingEntitlement:
            return .failure(KeychainError.missingEntitlement)
        default:
            return .failure(KeychainError.unhandled(status))
        }
    }

    /// Looks the item up in the legacy keychain, keeping its synchronizable
    /// attribute so migration preserves the user's iCloud choice. Returns
    /// `nil` for any failure — this is a best-effort repair path and must
    /// never turn a plain miss into a thrown error.
    private func legacyItem(account: String, service: String) -> LegacyItem? {
        var query = baseQuery(service: service, account: account, in: .legacy)
        query[kSecReturnData as String] = true
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny

        var item: CFTypeRef?
        guard secItem.copyMatching(query as CFDictionary, &item) == errSecSuccess,
              let attributes = item as? [String: Any],
              let data = attributes[kSecValueData as String] as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        let sync = (attributes[kSecAttrSynchronizable as String] as? Bool)
            ?? ((attributes[kSecAttrSynchronizable as String] as? NSNumber)?.boolValue ?? false)
        return LegacyItem(value: value, synchronizable: sync)
    }

    /// Promotes a legacy item into the data-protection keychain.
    ///
    /// Ordering is the safety property: the data-protection write happens
    /// first and the legacy copy is removed only after it succeeds. If the
    /// write fails the caller still has the value it read, and the legacy
    /// item is untouched, so the next read finds it again.
    private func migrateFromLegacy(_ item: LegacyItem, account: String, service: String) {
        let status = insert(value: item.value,
                            account: account,
                            service: service,
                            synchronizable: item.synchronizable)
        // errSecDuplicateItem means someone already migrated it — also fine.
        guard status == errSecSuccess || status == errSecDuplicateItem else { return }
        discardLegacyCopy(account: account, service: service)
    }

    /// Best-effort removal of the legacy copy. Never throws: a failure here
    /// leaves two copies, and the data-protection copy shadows the legacy one
    /// on every read, so the item is still correct.
    private func discardLegacyCopy(account: String, service: String) {
        guard migratesLegacyItems else { return }
        var query = baseQuery(service: service, account: account, in: .legacy)
        query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        _ = secItem.delete(query as CFDictionary)
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
