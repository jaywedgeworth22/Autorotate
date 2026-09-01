//
//  SettingsView.swift
//  Autorotate-macOS
//
//  Settings: Infisical connection (clientSecret → Keychain, never disk),
//  Keychain inventory with the iCloud Keychain sync toggle ("if allowed"),
//  and the scheduled-rotation interval.
//

import SwiftUI
import AutorotateCore

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var clientSecretInput = ""
    @State private var keychainItems: [KeychainItemInfo] = []
    @State private var message: String?

    // Audit chain verification
    @State private var chainVerification: AuditChainVerification?
    @State private var isVerifyingChain = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                infisicalSection
                keychainSection
                auditChainSection
                schedulerSection
                if let message {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                }
            }
            .padding(24)
        }
        .navigationTitle("Settings")
        .onAppear {
            reloadKeychainItems()
            Task { await verifyChain() }
        }
    }

    // MARK: - Infisical

    private var infisicalSection: some View {
        AutorotateCard {
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

                Divider().overlay(AutorotateTheme.border)

                HStack {
                    Text("Client secret")
                    Spacer()
                    StatusBadge(
                        color: appState.hasInfisicalClientSecret() ? AutorotateTheme.accent : AutorotateTheme.danger,
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
        AutorotateCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Keychain", systemImage: "lock.rectangle.fill")
                        .font(.headline)
                    Spacer()
                    Button { reloadKeychainItems() } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(AutorotateTheme.textSecondary)
                }

                Toggle("Sync new Keychain targets via iCloud Keychain (if allowed)",
                       isOn: Binding(
                        get: { appState.settings.iCloudKeychainSyncEnabled },
                        set: { appState.settings.iCloudKeychainSyncEnabled = $0 }))
                Text("Requires the Keychain Sharing capability and the user's iCloud Keychain setting.  When not allowed, items are stored device-local automatically.  Admin credentials and the Infisical clientSecret are never synced.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Divider().overlay(AutorotateTheme.border)

                Text("MANAGED ITEMS (\(keychainItems.count))")
                    .font(.caption2).fontWeight(.semibold)
                    .foregroundStyle(.secondary).tracking(1)
                if keychainItems.isEmpty {
                    Text("No Autorotate items in the Keychain yet (or the Keychain Sharing entitlement is missing).")
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                } else {
                    ForEach(keychainItems) { item in
                        HStack(spacing: 10) {
                            Image(systemName: item.synchronizable ? "icloud.fill" : "internaldrive.fill")
                                .font(.caption)
                                .foregroundStyle(item.synchronizable ? AutorotateTheme.accent : AutorotateTheme.textSecondary)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.service)
                                    .font(AutorotateTheme.mono(10))
                                    .foregroundStyle(AutorotateTheme.textPrimary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Text("\(item.category) · account \(item.account)")
                                    .font(.caption2)
                                    .foregroundStyle(AutorotateTheme.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    // MARK: - Audit chain

    private var auditChainSection: some View {
        AutorotateCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Audit chain", systemImage: "checkmark.seal.fill")
                        .font(.headline)
                    Spacer()
                    Button {
                        Task { await verifyChain() }
                    } label: {
                        if isVerifyingChain {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(AutorotateTheme.textSecondary)
                    .disabled(isVerifyingChain)
                }

                if let result = chainVerification {
                    HStack {
                        StatusBadge(color: result.isValid ? AutorotateTheme.accent : AutorotateTheme.danger,
                                    label: result.isValid ? "Chain intact" : "Chain broken")
                        Spacer()
                        Text("\(result.checked) checked")
                            .font(.caption)
                            .foregroundStyle(AutorotateTheme.textSecondary)
                    }
                    if result.legacyPrefixCount > 0 {
                        Text("\(result.legacyPrefixCount) legacy (pre-chain) entries skipped.")
                            .font(.caption2)
                            .foregroundStyle(AutorotateTheme.textSecondary)
                    }
                    if !result.isValid, let brokenId = result.brokenAtEntryId {
                        Text("Broken at entry \(brokenId.uuidString).")
                            .font(AutorotateTheme.mono(10))
                            .foregroundStyle(AutorotateTheme.danger)
                    }
                    if !result.isValid, let reason = result.failureReason {
                        Text(reason)
                            .font(.caption2)
                            .foregroundStyle(AutorotateTheme.danger)
                    }
                } else {
                    Text("Not yet verified.")
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                }

                Divider().overlay(AutorotateTheme.border)

                Text("Verifies the hash-chained audit log has not been altered or removed (AGENTS.md invariant 2).  Read-only — a broken chain is reported, never repaired.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Scheduler

    private var schedulerSection: some View {
        AutorotateCard {
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

    private func verifyChain() async {
        guard !isVerifyingChain else { return }
        isVerifyingChain = true
        defer { isVerifyingChain = false }
        do {
            chainVerification = try await appState.verifyAuditChain()
        } catch {
            message = "Audit chain verification failed: \(String(describing: error))"
        }
    }
}
