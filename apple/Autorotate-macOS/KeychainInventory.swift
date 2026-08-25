//
//  KeychainInventory.swift
//  Autorotate-macOS
//
//  Settings-screen inventory of the Keychain items Autorotate manages.
//
//  `KeychainManager` (AutorotateCore) is intentionally CRUD-only; listing is a
//  presentation concern, so it lives in the app target. Queries never return
//  item DATA — only service/account/synchronizable metadata.
//

import Foundation
import Security
import AutorotateCore

/// Metadata snapshot of one Autorotate-managed Keychain item (no value).
struct KeychainItemInfo: Identifiable, Sendable {
    var id: String { "\(service)|\(account)|\(synchronizable)" }
    let service: String
    let account: String
    let synchronizable: Bool

    /// Coarse classification for the Settings UI.
    var category: String {
        if service.hasPrefix("codes.autorotate.credential.") || service.hasPrefix("com.topspin.credential.") { return "Admin credential" }
        if service.hasPrefix("codes.autorotate.infisical.")  || service.hasPrefix("com.topspin.infisical.")  { return "Infisical clientSecret" }
        return "Managed secret value"
    }
}

/// Queries the Keychain for items under the `codes.autorotate` service prefix.
struct KeychainInventory: Sendable {

    let accessGroup: String?

    init(accessGroup: String? = KeychainManager.sharedAccessGroup) {
        self.accessGroup = accessGroup
    }

    /// All Autorotate-managed items (metadata only). Returns an empty list
    /// when the Keychain Sharing entitlement is missing instead of throwing.
    ///
    /// Keychain queries cannot prefix-match on service, so we fetch all
    /// generic passwords visible to the app and filter by the
    /// `codes.autorotate` prefix in memory.
    func managedItems() -> [KeychainItemInfo] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnAttributes as String: true,
            kSecAttrSynchronizable as String: kSecAttrSynchronizableAny
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let items = result as? [[String: Any]] else {
            return []
        }
        return items.compactMap { item in
            guard let service = item[kSecAttrService as String] as? String,
                  (service.hasPrefix("codes.autorotate") || service.hasPrefix("com.topspin")) else { return nil }
            return KeychainItemInfo(
                service: service,
                account: item[kSecAttrAccount as String] as? String ?? "—",
                synchronizable: item[kSecAttrSynchronizable as String] as? Bool ?? false)
        }
        .sorted { $0.service < $1.service }
    }

}
