//
//  AddSecretView.swift
//  Autorotate-iOS
//
//  Add-secret flow:
//    1. Pick a connector from the registry (grouped by capability:
//       programmatic / partial / updateOnly).
//    2. Name the secret and fill in connector-specific configuration.
//    3. Enter the admin credential — stored ONLY in the Keychain.
//    4. Configure initial targets (Infisical / file / webhook / Keychain).
//

import SwiftUI
import AutorotateCore

struct AddSecretView: View {

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    // Step 1: connector
    @State private var selectedConnectorId: String?
    // Step 2: naming + config
    @State private var name = ""
    @State private var configValues: [String: String] = [:]
    // Step 3: credential (Keychain only)
    @State private var adminCredential = ""
    // Step 4: targets
    @State private var useInfisical = false
    @State private var infSecretPath = "/"
    @State private var useFile = false
    @State private var filePath = ""
    @State private var fileFormat: FileFormat = .dotenv
    @State private var fileKey = ""
    @State private var useWebhook = false
    @State private var webhookUrl = ""
    @State private var useKeychain = true

    @State private var isSaving = false
    @State private var errorMessage: String?

    // Dismissable binding for the error alert.
    private var errorAlertBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    private var descriptor: ConnectorDescriptor? {
        selectedConnectorId.flatMap { ConnectorRegistry.descriptor(for: $0) }
    }

    /// Registry descriptors grouped by capability for the picker section.
    struct ConnectorGroup: Identifiable {
        let capability: ConnectorCapability
        let descriptors: [ConnectorDescriptor]
        var id: String { capability.rawValue }
    }

    private var groupedConnectors: [ConnectorGroup] {
        ConnectorCapability.allCases.compactMap { capability in
            let matches = ConnectorRegistry.all.filter { $0.capability == capability }
            return matches.isEmpty ? nil : ConnectorGroup(capability: capability, descriptors: matches)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                connectorSection
                if let descriptor {
                    namingSection(descriptor)
                    configSection(descriptor)
                    credentialSection(descriptor)
                    targetsSection
                    saveSection(descriptor)
                }
            }
            .scrollContentBackground(.hidden)
            .autoRotateScreenBackground()
            .navigationTitle("Add Secret")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Could not add secret", isPresented: errorAlertBinding) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: Sections

    private var connectorSection: some View {
        Section {
            ForEach(groupedConnectors) { group in
                Text(sectionTitle(for: group.capability))
                    .font(Theme.sectionLabel())
                    .foregroundStyle(Theme.textSecondary)
                    .tracking(1)
                ForEach(group.descriptors) { descriptor in
                    Button {
                        selectedConnectorId = descriptor.id
                        configValues = [:]
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: selectedConnectorId == descriptor.id
                                  ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selectedConnectorId == descriptor.id
                                                 ? Theme.accent : Theme.neutral)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(descriptor.displayName)
                                    .font(.callout)
                                    .foregroundStyle(Theme.text)
                                Text(descriptor.mechanism)
                                    .font(.caption2)
                                    .foregroundStyle(Theme.textSecondary)
                                    .lineLimit(2)
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        } header: {
            InstrumentSectionHeader(title: "Connector", systemImage: "puzzlepiece.extension")
        }
        .listRowBackground(Theme.surface)
    }

    private func namingSection(_ descriptor: ConnectorDescriptor) -> some View {
        Section {
            TextField("Secret name", text: $name)
                .textInputAutocapitalization(.never)
                .font(Theme.mono(.body))
        } header: {
            InstrumentSectionHeader(title: "Name", systemImage: "tag")
        } footer: {
            Text("E.g. \(descriptor.displayName.uppercased().replacingOccurrences(of: " ", with: "_"))_KEY — the label targets and the Keychain use.")
                .font(.caption2)
        }
        .listRowBackground(Theme.surface)
    }

    private func configSection(_ descriptor: ConnectorDescriptor) -> some View {
        let fields = ConnectorFactory.fields(for: descriptor.id)
        return Section {
            if fields.isEmpty {
                Text("This connector needs no configuration.")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
            ForEach(fields) { field in
                VStack(alignment: .leading, spacing: 2) {
                    TextField(field.label + (field.isOptional ? " (optional)" : ""),
                              text: binding(for: field.key))
                        .textInputAutocapitalization(.never)
                        .font(Theme.mono(.callout))
                    if let help = field.help {
                        Text(help)
                            .font(.caption2)
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        } header: {
            InstrumentSectionHeader(title: "Configuration", systemImage: "wrench.and.screwdriver")
        }
        .listRowBackground(Theme.surface)
    }

    private func credentialSection(_ descriptor: ConnectorDescriptor) -> some View {
        Section {
            SecureField("Admin credential", text: $adminCredential)
                .textInputAutocapitalization(.never)
                .font(Theme.mono(.callout))
        } header: {
            InstrumentSectionHeader(title: "Admin credential", systemImage: "lock.shield")
        } footer: {
            Text("\(descriptor.adminCredentialHint).  Stored ONLY in the Apple Keychain — never written to disk or synced.")
                .font(.caption2)
        }
        .listRowBackground(Theme.surface)
    }

    private var targetsSection: some View {
        Section {
            Toggle("Infisical workspace", isOn: $useInfisical).tint(Theme.accent)
            if useInfisical {
                TextField("Secret path", text: $infSecretPath)
                    .textInputAutocapitalization(.never)
                Text("Uses the workspace from Settings (\(model.settings.infisicalEnvironment)).")
                    .font(.caption2)
                    .foregroundStyle(Theme.textSecondary)
            }
            Toggle("File", isOn: $useFile).tint(Theme.accent)
            if useFile {
                TextField("Path", text: $filePath).textInputAutocapitalization(.never)
                Picker("Format", selection: $fileFormat) {
                    ForEach(FileFormat.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                TextField("Key", text: $fileKey).textInputAutocapitalization(.never)
            }
            Toggle("Webhook", isOn: $useWebhook).tint(Theme.accent)
            if useWebhook {
                TextField("HTTPS endpoint", text: $webhookUrl)
                    .keyboardType(.URL).textInputAutocapitalization(.never)
            }
            Toggle("Apple Keychain", isOn: $useKeychain).tint(Theme.accent)
        } header: {
            InstrumentSectionHeader(title: "Targets", systemImage: "target")
        } footer: {
            Text("Destinations that receive each newly rotated value.  More targets can be added later from the secret's detail screen.")
                .font(.caption2)
        }
        .listRowBackground(Theme.surface)
    }

    private func saveSection(_ descriptor: ConnectorDescriptor) -> some View {
        Section {
            Button {
                Task { await save(descriptor) }
            } label: {
                HStack {
                    Spacer()
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Add Secret")
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .foregroundStyle(Theme.accent)
            .disabled(!isValid(descriptor) || isSaving)
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Helpers

    private func sectionTitle(for capability: ConnectorCapability) -> String {
        switch capability {
        case .programmatic: return "PROGRAMMATIC — full API rotation"
        case .partial:      return "PARTIAL — some modes manual"
        case .updateOnly:   return "UPDATE ONLY — import from provider UI"
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(
            get: { configValues[key] ?? "" },
            set: { configValues[key] = $0 })
    }

    private func isValid(_ descriptor: ConnectorDescriptor) -> Bool {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if descriptor.capability == .programmatic && adminCredential.isEmpty { return false }
        for field in ConnectorFactory.fields(for: descriptor.id) where !field.isOptional {
            if (configValues[field.key] ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
                return false
            }
        }
        return true
    }

    private func buildTargets() throws -> [TargetBinding] {
        var targets: [TargetBinding] = []
        if useInfisical {
            guard model.settings.infisicalConfigured else {
                throw AddSecretError.infisicalNotConfigured
            }
            targets.append(.infisical(InfisicalTargetConfig(
                baseUrl: model.settings.infisicalBaseURL,
                workspaceId: model.settings.infisicalWorkspaceId,
                environment: model.settings.infisicalEnvironment,
                secretPath: infSecretPath.isEmpty ? "/" : infSecretPath,
                secretName: name)))
        }
        if useFile {
            guard !filePath.isEmpty, !fileKey.isEmpty else {
                throw AddSecretError.invalidTarget("File targets need a path and a key.")
            }
            targets.append(.file(FileTargetConfig(path: filePath, format: fileFormat, keyPath: fileKey)))
        }
        if useWebhook {
            guard let url = URL(string: webhookUrl), url.scheme == "https" else {
                throw AddSecretError.invalidTarget("Webhook targets need a valid HTTPS URL.")
            }
            targets.append(.webhook(WebhookTargetConfig(url: url)))
        }
        if useKeychain {
            targets.append(.keychain(KeychainTargetConfig(
                account: name,
                synchronizable: model.settings.keychainSyncEnabled)))
        }
        return targets
    }

    private func save(_ descriptor: ConnectorDescriptor) async {
        isSaving = true
        defer { isSaving = false }
        do {
            let targets = try buildTargets()
            // Validate the config by building the connector once.
            _ = try ConnectorFactory.makeConnector(connectorId: descriptor.id, config: configValues)
            let draft = NewSecretDraft(
                name: name.trimmingCharacters(in: .whitespaces),
                connectorId: descriptor.id,
                connectorConfig: configValues,
                adminCredential: adminCredential,
                policy: RotationPolicy(autoRotate: descriptor.capability == .programmatic),
                targets: targets)
            try await model.addSecret(draft)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    enum AddSecretError: Error, LocalizedError {
        case infisicalNotConfigured
        case invalidTarget(String)

        var errorDescription: String? {
            switch self {
            case .infisicalNotConfigured:
                return "Configure the Infisical workspace (clientId + workspaceId) in Settings first."
            case .invalidTarget(let message):
                return message
            }
        }
    }
}
