//
//  AppSettings.swift
//  TopSpin-macOS
//
//  App-wide settings: Infisical workspace configuration, the scheduler
//  interval, and the iCloud Keychain sync preference.
//
//  STORAGE RULE: everything here is non-secret configuration persisted in
//  UserDefaults. The Infisical Universal Auth clientSecret is stored ONLY
//  in the Keychain (`KeychainManager.infisicalClientSecretService`) and is
//  fetched into memory for the duration of one rotation run.
//
//  NOTE: `@Observable` does not support property observers (didSet), so
//  each setting is an observed private stored property behind a computed
//  accessor whose setter also persists to UserDefaults.
//

import Foundation
import Observation
import TopSpinCore

/// Observable app-settings store backed by UserDefaults.
@Observable
final class AppSettings {

    enum Key: String {
        case infisicalBaseUrl
        case infisicalClientId
        case infisicalWorkspaceId
        case infisicalEnvironment
        case infisicalSecretPath
        case schedulerIntervalMinutes
        case iCloudKeychainSyncEnabled
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        _infisicalBaseUrl = defaults.string(forKey: Key.infisicalBaseUrl.rawValue)
            ?? "https://app.infisical.com"
        _infisicalClientId = defaults.string(forKey: Key.infisicalClientId.rawValue) ?? ""
        _infisicalWorkspaceId = defaults.string(forKey: Key.infisicalWorkspaceId.rawValue) ?? ""
        _infisicalEnvironment = defaults.string(forKey: Key.infisicalEnvironment.rawValue) ?? "prod"
        _infisicalSecretPath = defaults.string(forKey: Key.infisicalSecretPath.rawValue) ?? "/"
        let minutes = defaults.integer(forKey: Key.schedulerIntervalMinutes.rawValue)
        _schedulerIntervalMinutes = minutes > 0 ? minutes : 15
        _iCloudKeychainSyncEnabled = defaults.bool(forKey: Key.iCloudKeychainSyncEnabled.rawValue)
    }

    // MARK: - Infisical configuration (non-secret)

    private var _infisicalBaseUrl: String
    var infisicalBaseUrl: String {
        get { _infisicalBaseUrl }
        set {
            _infisicalBaseUrl = newValue
            defaults.set(newValue, forKey: Key.infisicalBaseUrl.rawValue)
        }
    }

    /// Universal Auth client id — configuration, not a secret.
    private var _infisicalClientId: String
    var infisicalClientId: String {
        get { _infisicalClientId }
        set {
            _infisicalClientId = newValue
            defaults.set(newValue, forKey: Key.infisicalClientId.rawValue)
        }
    }

    private var _infisicalWorkspaceId: String
    var infisicalWorkspaceId: String {
        get { _infisicalWorkspaceId }
        set {
            _infisicalWorkspaceId = newValue
            defaults.set(newValue, forKey: Key.infisicalWorkspaceId.rawValue)
        }
    }

    private var _infisicalEnvironment: String
    var infisicalEnvironment: String {
        get { _infisicalEnvironment }
        set {
            _infisicalEnvironment = newValue
            defaults.set(newValue, forKey: Key.infisicalEnvironment.rawValue)
        }
    }

    private var _infisicalSecretPath: String
    var infisicalSecretPath: String {
        get { _infisicalSecretPath }
        set {
            _infisicalSecretPath = newValue
            defaults.set(newValue, forKey: Key.infisicalSecretPath.rawValue)
        }
    }

    /// Parsed base URL with fallback.
    var infisicalURL: URL {
        URL(string: infisicalBaseUrl) ?? URL(string: "https://app.infisical.com")!
    }

    /// Whether enough Infisical configuration exists to build a client.
    var infisicalConfigured: Bool {
        !infisicalClientId.isEmpty && !infisicalWorkspaceId.isEmpty && !infisicalEnvironment.isEmpty
    }

    /// Snapshot of the Infisical configuration read fresh from defaults.
    /// Used by `@Sendable` engine closures that cannot touch the main actor.
    static func currentInfisicalConfig(from defaults: UserDefaults = .standard)
        -> (baseUrl: URL, clientId: String, workspaceId: String, environment: String, secretPath: String) {
        let base = defaults.string(forKey: Key.infisicalBaseUrl.rawValue) ?? "https://app.infisical.com"
        return (
            URL(string: base) ?? URL(string: "https://app.infisical.com")!,
            defaults.string(forKey: Key.infisicalClientId.rawValue) ?? "",
            defaults.string(forKey: Key.infisicalWorkspaceId.rawValue) ?? "",
            defaults.string(forKey: Key.infisicalEnvironment.rawValue) ?? "prod",
            defaults.string(forKey: Key.infisicalSecretPath.rawValue) ?? "/"
        )
    }

    // MARK: - Scheduler

    private var _schedulerIntervalMinutes: Int
    /// Minutes between automatic `rotateDueSecrets()` ticks (minimum 1).
    var schedulerIntervalMinutes: Int {
        get { _schedulerIntervalMinutes }
        set {
            _schedulerIntervalMinutes = max(1, newValue)
            defaults.set(_schedulerIntervalMinutes, forKey: Key.schedulerIntervalMinutes.rawValue)
        }
    }

    // MARK: - iCloud Keychain

    private var _iCloudKeychainSyncEnabled: Bool
    /// Default for new Keychain targets' `synchronizable` flag. Sync happens
    /// only "if allowed" — the user must have iCloud Keychain enabled and
    /// the app must have the Keychain Sharing capability; otherwise
    /// `KeychainManager.save` silently falls back to a device-local item.
    /// Admin credentials and the Infisical clientSecret are NEVER marked
    /// synchronizable regardless of this setting.
    var iCloudKeychainSyncEnabled: Bool {
        get { _iCloudKeychainSyncEnabled }
        set {
            _iCloudKeychainSyncEnabled = newValue
            defaults.set(newValue, forKey: Key.iCloudKeychainSyncEnabled.rawValue)
        }
    }
}
