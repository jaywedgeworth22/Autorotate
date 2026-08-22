//
//  SettingsView.swift
//  TopSpin-iOS
//
//  Settings: Infisical workspace config (clientSecret → Keychain only),
//  Keychain options (iCloud sync with graceful "if allowed" fallback,
//  shared access group), the TopSpin-managed Keychain inventory (services,
//  accounts, last-updated timestamps, sync status), background rotation +
//  notification preferences, and the web-companion pairing note.
//

import SwiftUI
import TopSpinCore

struct SettingsView: View {

    @Environment(AppModel.self) private var model

    // Infisical form state
    @State private var baseUrl = ""
    @State private var clientId = ""
    @State private var workspaceId = ""
    @State private var environment = ""
    @State private var clientSecret = ""
    @State private var hasStoredSecret = false
    @State private var savedBanner = false

    // Keychain options
    @State private var syncEnabled = false
    @State private var useSharedGroup = true

    // Keychain inventory
    @State private var keychainItems: [KeychainItemInfo] = []

    // Biometrics
    @State private var biometricsEnabled = false

    // Notifications
    @State private var notificationsEnabled = false

    @State private var errorMessage: String?


    // Dismissable binding for the error alert.
    private var errorAlertBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    var body: some View {
        NavigationStack {
            Form {
                securitySection
                infisicalSection
                keychainOptionsSection
                keychainInventorySection
                backgroundSection
                companionSection
                aboutSection
            }
            .scrollContentBackground(.hidden)
            .topSpinScreenBackground()
            .navigationTitle("Settings")
            .onAppear { load() }
            .alert("Settings error", isPresented: errorAlertBinding) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: Security & Biometrics

    private var securitySection: some View {
        Section {
            Toggle(isOn: $biometricsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Require Face ID / Touch ID")
                    Text("Protects admin credentials and rotation triggers behind local device biometrics.")
                        .font(.caption2)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .tint(Theme.accent)
            .onChange(of: biometricsEnabled) { _, newValue in
                model.settings.biometricsEnabled = newValue
                if newValue {
                    Task { await model.authenticateWithBiometrics() }
                }
            }
        } header: {
            InstrumentSectionHeader(title: "Security", systemImage: "faceid")
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Infisical workspace

    private var infisicalSection: some View {
        Section {
            TextField("Base URL", text: $baseUrl)
                .keyboardType(.URL).textInputAutocapitalization(.never)
                .font(Theme.mono(.callout))
            TextField("Client ID (Universal Auth)", text: $clientId)
                .textInputAutocapitalization(.never)
                .font(Theme.mono(.callout))
            SecureField("Client Secret → Keychain", text: $clientSecret)
                .textInputAutocapitalization(.never)
                .font(Theme.mono(.callout))
            TextField("Workspace ID", text: $workspaceId)
                .textInputAutocapitalization(.never)
                .font(Theme.mono(.callout))
            TextField("Environment", text: $environment)
                .textInputAutocapitalization(.never)
                .font(Theme.mono(.callout))

            HStack {
                Label("clientSecret", systemImage: hasStoredSecret ? "checkmark.lock.fill" : "exclamationmark.lock")
                    .font(.caption)
                    .foregroundStyle(hasStoredSecret ? Theme.accent : Theme.warning)
                Spacer()
                Text(hasStoredSecret ? "stored in Keychain" : "not stored")
                    .font(Theme.mono(.caption2))
                    .foregroundStyle(Theme.textSecondary)
            }

            Button("Save Infisical Settings") { saveInfisical() }
                .foregroundStyle(Theme.accent)

            if savedBanner {
                Label("Saved. clientSecret is in the Keychain only.", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.accent)
            }
        } header: {
            InstrumentSectionHeader(title: "Infisical workspace", systemImage: "cloud")
        } footer: {
            Text("Universal Auth (architecture.md §4). The clientId/workspaceId live in app settings; the clientSecret is stored ONLY in the Keychain and read in-memory per rotation run.")
                .font(.caption2)
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Keychain options

    private var keychainOptionsSection: some View {
        Section {
            Toggle(isOn: $syncEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sync managed secrets via iCloud Keychain")
                    Text("Applied “if allowed” — falls back to a device-local item when iCloud Keychain is off.")
                        .font(.caption2)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .tint(Theme.accent)
            .onChange(of: syncEnabled) { _, newValue in
                model.settings.keychainSyncEnabled = newValue
                model.applyKeychainSettings()
            }

            Toggle(isOn: $useSharedGroup) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Shared access group (com.topspin.shared)")
                    Text("Requires the Keychain Sharing capability. Turn off for app-private items during development.")
                        .font(.caption2)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .tint(Theme.accent)
            .onChange(of: useSharedGroup) { _, newValue in
                model.settings.useSharedAccessGroup = newValue
                model.applyKeychainSettings()
                refreshInventory()
            }
        } header: {
            InstrumentSectionHeader(title: "Keychain options", systemImage: "key")
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Keychain inventory

    private var keychainInventorySection: some View {
        Section {
            if keychainItems.isEmpty {
                Text("No TopSpin-managed keychain items yet.")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
            ForEach(keychainItems) { item in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Image(systemName: icon(for: item.category))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 18)
                        Text(item.account)
                            .font(.callout)
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                        Spacer()
                        if item.synchronizable {
                            Label("iCloud", systemImage: "icloud")
                                .font(Theme.mono(.caption2))
                                .foregroundStyle(Theme.accent)
                        } else {
                            Text("local")
                                .font(Theme.mono(.caption2))
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                    Text(KeychainInventory.shortService(item.service))
                        .font(Theme.mono(.caption2))
                        .foregroundStyle(Theme.textSecondary)
                    HStack {
                        Text(item.category.rawValue)
                        Spacer()
                        if let modified = item.modifiedAt {
                            Text("updated \(modified.formatted(.relative(presentation: .named)))")
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(Theme.textSecondary)
                }
            }
            Button {
                refreshInventory()
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
                    .foregroundStyle(Theme.accent)
            }
        } header: {
            InstrumentSectionHeader(title: "Keychain — managed items", systemImage: "lock.rectangle.stack")
        } footer: {
            Text("Values are never displayed. “updated” is the Keychain modification timestamp; iCloud badge means the item is synchronizable (if allowed).")
                .font(.caption2)
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Background & notifications

    private var backgroundSection: some View {
        Section {
            Toggle("Rotation failure notifications", isOn: $notificationsEnabled)
                .tint(Theme.accent)
                .onChange(of: notificationsEnabled) { _, newValue in
                    model.settings.notificationsEnabled = newValue
                    if newValue {
                        Task {
                            await NotificationManager.requestAuthorizationIfNeeded(settings: model.settings)
                        }
                    }
                }
            if let last = model.lastBackgroundRefreshAt {
                LabeledContent("Last background refresh") {
                    Text(last, style: .relative)
                }
            } else {
                LabeledContent("Last background refresh", value: "never")
            }
        } header: {
            InstrumentSectionHeader(title: "Background rotation", systemImage: "clock.arrow.2.circlepath")
        } footer: {
            Text("A BGAppRefreshTask (com.topspin.refresh) runs rotateDueSecrets() when iOS schedules it; a new refresh is requested every time the app backgrounds. Keychain items use AfterFirstUnlock so background runs can read credentials.")
                .font(.caption2)
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Companion pairing

    private var companionSection: some View {
        Section {
            Label("Pair with the TopSpin web app", systemImage: "link")
                .foregroundStyle(Theme.accent)
            Text("The web dashboard manages the same rotation pipeline server-side. Point both at the same Infisical workspace (same workspaceId/environment above) and fingerprints will match across platforms. A signed pairing flow (QR code + shared access group) is planned; for now keep connector admin credentials on-device and let the web app hold its own encrypted copies.")
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        } header: {
            InstrumentSectionHeader(title: "Companion app", systemImage: "laptopcomputer.and.iphone")
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: About

    private var aboutSection: some View {
        Section {
            LabeledContent("Storage rule", value: "metadata + sha256[0:8] only")
            LabeledContent("Pipeline", value: "LOCK·ROTATE·PUSH·VERIFY·COMMIT·AUDIT")
            LabeledContent("Core", value: "TopSpinCore (SwiftPM, local)")
        } header: {
            InstrumentSectionHeader(title: "About", systemImage: "info.circle")
        }
        .listRowBackground(Theme.surface)
        .font(Theme.mono(.caption))
    }

    // MARK: Actions

    private func load() {
        baseUrl = model.settings.infisicalBaseUrl
        clientId = model.settings.infisicalClientId
        workspaceId = model.settings.infisicalWorkspaceId
        environment = model.settings.infisicalEnvironment
        syncEnabled = model.settings.keychainSyncEnabled
        useSharedGroup = model.settings.useSharedAccessGroup
        notificationsEnabled = model.settings.notificationsEnabled
        biometricsEnabled = model.settings.biometricsEnabled
        hasStoredSecret = model.settings.infisicalWorkspaceId.isEmpty
            ? false
            : model.hasInfisicalClientSecret(workspaceId: model.settings.infisicalWorkspaceId)
        refreshInventory()
    }

    private func saveInfisical() {
        do {
            try model.saveInfisicalSettings(baseUrl: baseUrl, clientId: clientId,
                                            workspaceId: workspaceId, environment: environment,
                                            clientSecret: clientSecret)
            clientSecret = ""
            hasStoredSecret = model.hasInfisicalClientSecret(workspaceId: workspaceId)
            savedBanner = true
            refreshInventory()
            Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                savedBanner = false
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshInventory() {
        keychainItems = model.keychainInventory()
    }

    private func icon(for category: KeychainItemInfo.Category) -> String {
        switch category {
        case .managedSecret:         return "key.fill"
        case .adminCredential:       return "lock.shield.fill"
        case .infisicalClientSecret: return "cloud.fill"
        case .other:                 return "questionmark.key.fill"
        }
    }
}
