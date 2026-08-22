//
//  SettingsStorage.swift
//  TopSpin-iOS
//
//  Sendable settings storage backed by `UserDefaults` (which is internally
//  synchronized). Read by both the UI layer (via `AppModel`, @MainActor) and
//  the rotation engine's @Sendable closures off the main actor.
//
//  STORAGE RULE: only non-secret configuration lives here. The Infisical
//  clientSecret and connector admin credentials are NEVER written to
//  UserDefaults — they go straight to the Keychain (see KeychainManager).
//

import Foundation

/// Non-secret app settings, persisted in UserDefaults.
struct SettingsStorage: Sendable {

    private enum Key {
        static let infisicalBaseUrl = "settings.infisical.baseUrl"
        static let infisicalClientId = "settings.infisical.clientId"
        static let infisicalWorkspaceId = "settings.infisical.workspaceId"
        static let infisicalEnvironment = "settings.infisical.environment"
        static let keychainSyncEnabled = "settings.keychain.synchronizable"
        static let useSharedAccessGroup = "settings.keychain.useSharedAccessGroup"
        static let notificationsEnabled = "settings.notifications.enabled"
        static let notificationPermissionAsked = "settings.notifications.asked"
        static let lastBackgroundRefreshAt = "settings.background.lastRefreshAt"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: Infisical workspace (architecture.md §4)

    var infisicalBaseUrl: String {
        get { defaults.string(forKey: Key.infisicalBaseUrl) ?? "https://app.infisical.com" }
        nonmutating set { defaults.set(newValue, forKey: Key.infisicalBaseUrl) }
    }

    var infisicalBaseURL: URL {
        URL(string: infisicalBaseUrl) ?? URL(string: "https://app.infisical.com")!
    }

    var infisicalClientId: String {
        get { defaults.string(forKey: Key.infisicalClientId) ?? "" }
        nonmutating set { defaults.set(newValue, forKey: Key.infisicalClientId) }
    }

    var infisicalWorkspaceId: String {
        get { defaults.string(forKey: Key.infisicalWorkspaceId) ?? "" }
        nonmutating set { defaults.set(newValue, forKey: Key.infisicalWorkspaceId) }
    }

    var infisicalEnvironment: String {
        get { defaults.string(forKey: Key.infisicalEnvironment) ?? "prod" }
        nonmutating set { defaults.set(newValue, forKey: Key.infisicalEnvironment) }
    }

    var infisicalConfigured: Bool {
        !infisicalClientId.isEmpty && !infisicalWorkspaceId.isEmpty
    }

    // MARK: Keychain options (architecture.md §5)

    /// Default for the iCloud Keychain (`kSecAttrSynchronizable`) flag on
    /// newly created managed-secret keychain targets. Sync happens only
    /// "if allowed" by the user's iCloud settings; KeychainManager falls
    /// back to a device-local item automatically.
    var keychainSyncEnabled: Bool {
        get { defaults.bool(forKey: Key.keychainSyncEnabled) }
        nonmutating set { defaults.set(newValue, forKey: Key.keychainSyncEnabled) }
    }

    /// Whether to use the shared access group `com.topspin.shared`
    /// (requires the Keychain Sharing capability / entitlements). When off,
    /// items are private to this app — useful before capabilities are
    /// configured in Xcode.
    var useSharedAccessGroup: Bool {
        get {
            if defaults.object(forKey: Key.useSharedAccessGroup) == nil { return true }
            return defaults.bool(forKey: Key.useSharedAccessGroup)
        }
        nonmutating set { defaults.set(newValue, forKey: Key.useSharedAccessGroup) }
    }

    // MARK: Notifications

    var notificationsEnabled: Bool {
        get {
            if defaults.object(forKey: Key.notificationsEnabled) == nil { return true }
            return defaults.bool(forKey: Key.notificationsEnabled)
        }
        nonmutating set { defaults.set(newValue, forKey: Key.notificationsEnabled) }
    }

    /// Whether we have already asked for notification permission once.
    /// Permission is requested politely — at most once automatically.
    var notificationPermissionAsked: Bool {
        get { defaults.bool(forKey: Key.notificationPermissionAsked) }
        nonmutating set { defaults.set(newValue, forKey: Key.notificationPermissionAsked) }
    }

    // MARK: Background refresh bookkeeping

    var lastBackgroundRefreshAt: Date? {
        get { defaults.object(forKey: Key.lastBackgroundRefreshAt) as? Date }
        nonmutating set { defaults.set(newValue, forKey: Key.lastBackgroundRefreshAt) }
    }
}
