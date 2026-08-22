//
//  AddTargetView.swift
//  TopSpin-iOS
//
//  Sheet for adding a target binding to a secret: Infisical, file, webhook
//  or Apple Keychain. Target configs hold routing metadata only — no secret
//  material (Infisical clientSecret lives in the Keychain).
//

import SwiftUI
import TopSpinCore

struct AddTargetView: View {

    let secret: SecretRecord

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var kind: TargetKind = .infisical
    @State private var required = true

    // Infisical fields (prefilled from workspace settings)
    @State private var infWorkspaceId = ""
    @State private var infEnvironment = ""
    @State private var infSecretPath = "/"
    @State private var infSecretName = ""
    @State private var infBaseUrl = ""

    // File fields
    @State private var filePath = ""
    @State private var fileFormat: FileFormat = .dotenv
    @State private var fileKey = ""
    @State private var fileSection = ""

    // Webhook fields
    @State private var webhookUrl = ""
    @State private var webhookIncludeValue = false

    // Keychain fields
    @State private var keychainAccount = ""
    @State private var keychainSynchronizable = false

    @State private var errorMessage: String?

    // Dismissable binding for the error alert.
    private var errorAlertBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Kind", selection: $kind) {
                        ForEach(TargetKind.allCases, id: \.self) { kind in
                            Label(kind.rawValue.capitalized, systemImage: Theme.icon(for: kind))
                                .tag(kind)
                        }
                    }
                    Toggle("Required for commit", isOn: $required)
                        .tint(Theme.accent)
                } header: {
                    InstrumentSectionHeader(title: "Target kind")
                }

                switch kind {
                case .infisical: infisicalSection
                case .file:      fileSection
                case .webhook:   webhookSection
                case .keychain:  keychainSection
                }

                Section {
                    Button("Add Target") { addTarget() }
                        .foregroundStyle(Theme.accent)
                }
            }
            .scrollContentBackground(.hidden)
            .topSpinScreenBackground()
            .navigationTitle("Add Target")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { prefill() }
            .alert("Invalid target", isPresented: errorAlertBinding) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: Sections

    private var infisicalSection: some View {
        Section {
            TextField("Base URL", text: $infBaseUrl)
                .keyboardType(.URL).textInputAutocapitalization(.never)
            TextField("Workspace ID", text: $infWorkspaceId)
                .textInputAutocapitalization(.never)
            TextField("Environment", text: $infEnvironment)
                .textInputAutocapitalization(.never)
            TextField("Secret path", text: $infSecretPath)
                .textInputAutocapitalization(.never)
            TextField("Secret name in Infisical", text: $infSecretName)
                .textInputAutocapitalization(.never)
        } header: {
            InstrumentSectionHeader(title: "Infisical", systemImage: "cloud")
        } footer: {
            Text("Uses the Universal Auth clientSecret from Settings (Keychain). Values are upserted via REST v3 raw secrets.")
                .font(.caption2)
        }
    }

    private var fileSection: some View {
        Section {
            TextField("Absolute path (app container)", text: $filePath)
                .textInputAutocapitalization(.never)
            Picker("Format", selection: $fileFormat) {
                ForEach(FileFormat.allCases, id: \.self) { format in
                    Text(format.rawValue).tag(format)
                }
            }
            TextField("Key", text: $fileKey)
                .textInputAutocapitalization(.never)
            if fileFormat == .ini || fileFormat == .toml {
                TextField(fileFormat == .ini ? "Section (e.g. default)" : "Table",
                          text: $fileSection)
                    .textInputAutocapitalization(.never)
            }
        } header: {
            InstrumentSectionHeader(title: "File", systemImage: "doc")
        } footer: {
            Text("iOS sandbox note: file targets are most useful for files inside the app's container or shared via document picker. On macOS, paths like ~/.aws/credentials work with the right entitlements.")
                .font(.caption2)
        }
    }

    private var webhookSection: some View {
        Section {
            TextField("HTTPS endpoint", text: $webhookUrl)
                .keyboardType(.URL).textInputAutocapitalization(.never)
            Toggle("Include plaintext value in payload", isOn: $webhookIncludeValue)
                .tint(Theme.warning)
        } header: {
            InstrumentSectionHeader(title: "Webhook", systemImage: "antenna.radiowaves.left.and.right")
        } footer: {
            Text("By default the POST body contains only name + valueRef + sha256 fingerprint. Enable plaintext only for receivers you fully trust.")
                .font(.caption2)
        }
    }

    private var keychainSection: some View {
        Section {
            TextField("Account (defaults to secret name)", text: $keychainAccount)
                .textInputAutocapitalization(.never)
            Toggle("Sync via iCloud Keychain (if allowed)", isOn: $keychainSynchronizable)
                .tint(Theme.accent)
        } header: {
            InstrumentSectionHeader(title: "Keychain", systemImage: "key")
        } footer: {
            Text("Stored as a generic password under service com.topspin.<secretId>, accessible after first unlock. iCloud sync falls back to a local item when not allowed.")
                .font(.caption2)
        }
    }

    // MARK: Actions

    private func prefill() {
        infBaseUrl = model.settings.infisicalBaseUrl
        infWorkspaceId = model.settings.infisicalWorkspaceId
        infEnvironment = model.settings.infisicalEnvironment
        infSecretName = secret.name
        keychainAccount = secret.name
        keychainSynchronizable = model.settings.keychainSyncEnabled
    }

    private func addTarget() {
        let binding: TargetBinding
        switch kind {
        case .infisical:
            guard !infWorkspaceId.isEmpty, !infEnvironment.isEmpty, !infSecretName.isEmpty else {
                errorMessage = "Workspace, environment and secret name are required."
                return
            }
            guard let url = URL(string: infBaseUrl), url.scheme?.hasPrefix("http") == true else {
                errorMessage = "Invalid Infisical base URL."
                return
            }
            binding = .infisical(InfisicalTargetConfig(
                required: required, baseUrl: url,
                workspaceId: infWorkspaceId, environment: infEnvironment,
                secretPath: infSecretPath.isEmpty ? "/" : infSecretPath,
                secretName: infSecretName))
        case .file:
            guard !filePath.isEmpty, !fileKey.isEmpty else {
                errorMessage = "Path and key are required."
                return
            }
            binding = .file(FileTargetConfig(
                required: required, path: filePath, format: fileFormat,
                keyPath: fileKey,
                section: fileSection.isEmpty ? nil : fileSection))
        case .webhook:
            guard let url = URL(string: webhookUrl), url.scheme == "https" else {
                errorMessage = "Webhook endpoints must be HTTPS URLs."
                return
            }
            binding = .webhook(WebhookTargetConfig(
                required: required, url: url,
                includeSecretValue: webhookIncludeValue))
        case .keychain:
            binding = .keychain(KeychainTargetConfig(
                required: required,
                account: keychainAccount.isEmpty ? secret.name : keychainAccount,
                synchronizable: keychainSynchronizable))
        }

        var targets = secret.targets
        targets.append(binding)
        Task {
            try? await model.updateTargets(for: secret, targets: targets)
            dismiss()
        }
    }
}
