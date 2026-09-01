//
//  AdminCredentialProvider.swift
//  Autorotate-iOS
//
//  Keychain-backed `AdminCredentialProvider` (architecture.md §5): connector
//  admin credentials are stored ONLY in the Apple Keychain via
//  `KeychainManager`, scoped per connector+secret, never synchronizable.
//
//  AutorotateCore ships an equivalent (`KeychainCredentialProvider`); the app
//  owns this wrapper so the audit log can record credential lookups without
//  ever touching the credential material itself.
//

import Foundation
import AutorotateCore

/// Supplies connector admin credentials from the Apple Keychain to the
/// rotation engine. The returned value exists in memory for the duration of
/// a single rotation run only.
struct KeychainAdminCredentialProvider: AdminCredentialProvider {

    private let keychain: KeychainManager

    init(keychain: KeychainManager) {
        self.keychain = keychain
    }

    func adminCredential(connectorId: String, secretId: UUID) async throws -> String {
        do {
            return try keychain.adminCredential(connectorId: connectorId, secretId: secretId)
        } catch {
            throw ConnectorError.invalidCredential(
                "No admin credential in Keychain for connector '\(connectorId)'. " +
                "Re-enter it from the secret's detail screen.")
        }
    }
}
