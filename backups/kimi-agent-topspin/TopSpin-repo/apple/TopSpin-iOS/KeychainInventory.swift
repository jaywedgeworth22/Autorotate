//
//  KeychainInventory.swift
//  TopSpin-iOS
//
//  Read-only inventory of TopSpin-managed Keychain items, powering the
//  Settings → Keychain section ("use Keychain to keep track of and update
//  secrets"). Lists item ATTRIBUTES only — service, account, timestamps,
//  sync status. Values are never read or displayed here.
//
//  Item namespaces (KeychainManager.swift):
//    com.topspin.<secretId>                      managed secret values
//    com.topspin.credential.<connector>.<id>     connector admin credentials
//    com.topspin.infisical.<workspaceId>         Infisical clientSecret
//

import Foundation
import Security

/// Attributes of one TopSpin-managed keychain item (never its value).
struct KeychainItemInfo: Identifiable, Sendable {
    enum Category: String, Sendable {
        case managedSecret = "Managed secret"
        case adminCredential = "Admin credential"
        case infisicalClientSecret = "Infisical clientSecret"
        case other = "Other"
    }

    let service: String
    let account: String
    let createdAt: Date?
    let modifiedAt: Date?
    let synchronizable: Bool
    let category: Category

    var id: String { "\(service)/\(account)" }

    init(service: String, account: String, createdAt: Date?,
         modifiedAt: Date?, synchronizable: Bool) {
        self.service = service
        self.account = account
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.synchronizable = synchronizable
        if service.hasPrefix("com.topspin.credential.") {
            self.category = .adminCredential
        } else if service.hasPrefix("com.topspin.infisical.") {
            self.category = .infisicalClientSecret
        } else if service.hasPrefix("com.topspin.") {
            self.category = .managedSecret
        } else {
            self.category = .other
        }
    }
}

/// Queries the Keychain for items in the `com.topspin.*` service namespace.
enum KeychainInventory {

    /// Returns all TopSpin-managed items visible to this app, sorted by
    /// service. When `accessGroup` is non-nil the query targets the shared
    /// group and requires the Keychain Sharing entitlement; if the
    /// entitlement is missing an empty list is returned (graceful fallback).
    static func managedItems(accessGroup: String?) -> [KeychainItemInfo] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
            // Match both local and iCloud-synchronized items.
            kSecAttrSynchronizable as String: kSecAttrSynchronizableAny
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let items = result as? [[String: Any]] else {
            // errSecItemNotFound (empty keychain) or errSecMissingEntitlement
            // (capability not enabled yet) — both render as an empty list.
            return []
        }

        return items.compactMap { item -> KeychainItemInfo? in
            guard let service = item[kSecAttrService as String] as? String,
                  service.hasPrefix("com.topspin"),
                  let account = item[kSecAttrAccount as String] as? String else {
                return nil
            }
            return KeychainItemInfo(
                service: service,
                account: account,
                createdAt: item[kSecAttrCreationDate as String] as? Date,
                modifiedAt: item[kSecAttrModificationDate as String] as? Date,
                synchronizable: (item[kSecAttrSynchronizable as String] as? Bool) ?? false)
        }
        .sorted { $0.service < $1.service }
    }

    /// Short display form of a service name: strips the `com.topspin.`
    /// prefix and truncates UUID tails for readability.
    static func shortService(_ service: String) -> String {
        var text = service.replacingOccurrences(of: "com.topspin.", with: "")
        // Collapse embedded UUIDs to their first 8 characters.
        while let range = text.range(
            of: #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"#,
            options: .regularExpression) {
            let uuid = text[range]
            text.replaceSubrange(range, with: "\(uuid.prefix(8))…")
        }
        return text
    }
}
