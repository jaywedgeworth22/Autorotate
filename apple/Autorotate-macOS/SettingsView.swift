//
//  SettingsView.swift
//  TopSpin-macOS
//
//  Settings: Infisical connection (clientSecret → Keychain, never disk),
//  Keychain inventory with the iCloud Keychain sync toggle ("if allowed"),
//  and the scheduled-rotation interval.
//

import SwiftUI
import TopSpinCore

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var clientSecretInput = ""
    @State private var keychainItems: [KeychainItemInfo] = []
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                infisicalSection
                keychainSection
                schedulerSection
                if let message {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                }
            }
            .padding(24)
        }
        .navigationTitle("Settings")
        .onAppear { reloadKeychainItems() }
    }

    // MARK: - Infisical

    private var infisicalSection: some View {
        TopSpinCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Infisical", systemImage: "cloud.fill")
                    .font(.headline)
                LabeledContent("Base URL") {
                    TextField("https://app.infisical.com", text: stringBinding(\.infisicalBaseUrl))
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Client ID (Universal Auth)") {
                    TextField("", text: stringBinding(\.infisicalClientId))
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Workspace ID") {
                    TextField("", text: stringBinding(\.infisicalWorkspaceId))
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Environment") {
                    TextField("prod", text: stringBinding(\.infisicalEnvironment))
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Secret path") {
                    TextField("/", text: stringBinding(\.infisicalSecretPath))
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                }

                Divider().overlay(TopSpinTheme.border)

                HStack {
                    Text("Client secret")
                    Spacer()
                    StatusBadge(
                        color: appState.hasInfisicalClientSecret() ? TopSpinTheme.accent : TopSpinTheme.danger,
                        label: appState.hasInfisicalClientSecret() ? "stored in Keychain" : "missing")
                }
                HStack {
                    SecureField("Paste clientSecret to store in Keychain…", text: $clientSecretInput)
                        .textFieldStyle(.roundedBorder)
                    Button("Store in Keychain") { storeClientSecret() }
                        .disabled(clientSecretInput.isEmpty)
                    if appState.hasInfisicalClientSecret() {
                        Button("Remove", role: .destructive) { removeClientSecret() }
                    }
                }
                Text("The clientSecret is written straight to the Keychain (device-local, never synchronizable) and is fetched into memory only for the duration of a rotation run.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Keychain

    private var keychainSection: some View {
        TopSpinCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Keychain", systemImage: "lock.rectangle.fill")
                        .font(.headline)
                    Spacer()
                    Button { reloadKeychainItems() } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(TopSpinTheme.textSecondary)
                }

                Toggle("Sync new Keychain targets via iCloud Keychain (if allowed)",
                       isOn: Binding(
                        get: { appState.settings.iCloudKeychainSyncEnabled },
                        set: { appState.settings.iCloudKeychainSyncEnabled = $0 }))
                Text("Requires the Keychain Sharing capability and the user's iCloud Keychain setting. When not allowed, items are stored device-local automatically. Admin credentials and the Infisical clientSecret are never synced.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Divider().overlay(TopSpinTheme.border)

                Text("MANAGED ITEMS (\(keychainItems.count))")
                    .font(.caption2).fontWeight(.semibold)
                    .foregroundStyle(.secondary).tracking(1)
                if keychainItems.isEmpty {
                    Text("No TopSpin items in the Keychain yet (or the Keychain Sharing entitlement is missing).")
                        .font(.caption)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                } else {
                    ForEach(keychainItems) { item in
                        HStack(spacing: 10) {
                            Image(systemName: item.synchronizable ? "icloud.fill" : "internaldrive.fill")
                                .font(.caption)
                                .foregroundStyle(item.synchronizable ? TopSpinTheme.accent : TopSpinTheme.textSecondary)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.service)
                                    .font(TopSpinTheme.mono(10))
                                    .foregroundStyle(TopSpinTheme.textPrimary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Text("\(item.category) · account \(item.account)")
                                    .font(.caption2)
                                    .foregroundStyle(TopSpinTheme.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    // MARK: - Scheduler

    private var schedulerSection: some View {
        TopSpinCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Scheduled rotation", systemImage: "clock.arrow.2.circlepath")
                    .font(.headline)
                Stepper("Check for due secrets every \(appState.settings.schedulerIntervalMinutes) min",
                        value: Binding(
                            get: { appState.settings.schedulerIntervalMinutes },
                            set: {
                                appState.settings.schedulerIntervalMinutes = $0
                                appState.scheduler.applyInterval(minutes: $0)
                            }),
                        in: 1...1440)
                HStack {
                    Text("While the app runs, the timer calls RotationEngine.rotateDueSecrets(); the menu bar icon reflects state.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Run check now") {
                        Task { await appState.scheduler.tick() }
                    }
                    .controlSize(.small)
                }
            }
        }
    }

    // MARK: - Helpers

    private func stringBinding(_ keyPath: ReferenceWritableKeyPath<AppSettings, String>) -> Binding<String> {
        Binding(
            get: { appState.settings[keyPath: keyPath] },
            set: { appState.settings[keyPath: keyPath] = $0 })
    }

    private func storeClientSecret() {
        let secret = clientSecretInput
        clientSecretInput = ""
        do {
            try appState.storeInfisicalClientSecret(secret)
            message = "Client secret stored in Keychain."
        } catch {
            message = "Keychain error: \(String(describing: error))"
        }
        reloadKeychainItems()
    }

    private func removeClientSecret() {
        try? appState.deleteInfisicalClientSecret()
        message = "Client secret removed."
        reloadKeychainItems()
    }

    private func reloadKeychainItems() {
        keychainItems = KeychainInventory(accessGroup: appState.keychain.accessGroup).managedItems()
    }
}
