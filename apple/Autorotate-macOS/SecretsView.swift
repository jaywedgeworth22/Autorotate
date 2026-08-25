//
//  SecretsView.swift
//  Autorotate-macOS
//
//  Secrets manager: a table of managed secrets (masked value column —
//  values are never persisted, so the table shows `••••••` plus the
//  fingerprint chip), with a detail editor for the rotation policy, target
//  bindings, connector settings and the Keychain-held admin credential.
//
//  "Rotate Now" runs the six-step pipeline with a confirmation step;
//  update-only connectors collect the manually rotated value via a sheet
//  (held in memory, handed to the engine, never stored).
//

import SwiftUI
import SwiftData
import AutorotateCore

struct SecretsView: View {
    @Environment(AppState.self) private var appState
    @Query(sort: \SecretEntity.createdAt) private var entities: [SecretEntity]

    @State private var selection: UUID?
    @State private var showAddSheet = false
    @State private var pendingDelete: SecretEntity?

    private var records: [SecretRecord] { entities.map { $0.toRecord() } }

    var body: some View {
        HSplitView {
            tablePane
                .frame(minWidth: 460)
            if let selection, let entity = entities.first(where: { $0.id == selection }) {
                SecretDetailView(entity: entity)
                    .id(entity.id) // reset editor state on selection change
                    .frame(minWidth: 380, idealWidth: 440)
            } else {
                placeholder
                    .frame(minWidth: 380)
            }
        }
        .navigationTitle("Secrets")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showAddSheet = true } label: {
                    Label("Add Secret", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddSecretSheet()
        }
        .confirmationDialog("Delete this secret?",
                            isPresented: Binding(
                                get: { pendingDelete != nil },
                                set: { if !$0 { pendingDelete = nil } }),
                            titleVisibility: .visible) {
            Button("Delete Secret", role: .destructive) {
                if let entity = pendingDelete {
                    let record = entity.toRecord()
                    Task {
                        try? await appState.deleteSecret(record)
                        selection = nil
                    }
                }
                pendingDelete = nil
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("Metadata, the Keychain admin credential and the managed Keychain value are removed. Values already written to files/Infisical are left in place.")
        }
        .onDeleteCommand {
            if let selection, let entity = entities.first(where: { $0.id == selection }) {
                pendingDelete = entity
            }
        }
    }

    // MARK: - Table

    private var tablePane: some View {
        Table(records, selection: $selection) {
            TableColumn("Name") { record in
                VStack(alignment: .leading, spacing: 2) {
                    Text(record.name).font(.callout).fontWeight(.medium)
                    Text(ConnectorRegistry.descriptor(for: record.connectorId)?.displayName
                         ?? record.connectorId)
                        .font(.caption2)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                }
            }
            .width(min: 140, ideal: 180)

            TableColumn("Value") { _ in
                // Values are never persisted — masked placeholder only.
                Text("••••••••")
                    .font(AutorotateTheme.mono(11))
                    .foregroundStyle(AutorotateTheme.textSecondary)
            }
            .width(80)

            TableColumn("Fingerprint") { record in
                FingerprintChip(fingerprint: record.fingerprint)
            }
            .width(90)

            TableColumn("Status") { record in
                StatusBadge(color: AutorotateTheme.statusColor(record.status),
                            label: record.status.rawValue)
            }
            .width(90)

            TableColumn("Last rotated") { record in
                if let last = record.lastRotatedAt {
                    Text(last, style: .relative)
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                } else {
                    Text("never")
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                }
            }
            .width(100)

            TableColumn("Next due") { record in
                Text(nextDueText(record))
                    .font(.caption)
                    .foregroundStyle(record.isDue() ? AutorotateTheme.warning : AutorotateTheme.textSecondary)
            }
            .width(100)
        }
        .contextMenu(forSelectionType: UUID.self) { ids in
            if let id = ids.first, let entity = entities.first(where: { $0.id == id }) {
                Button("Rotate Now") {
                    Task { await appState.rotationService.rotateNow(secretId: id) }
                }
                Divider()
                Button("Delete…", role: .destructive) { pendingDelete = entity }
            }
        }
    }

    private var placeholder: some View {
        ContentUnavailableView {
            Label("No secret selected", systemImage: "key")
        } description: {
            Text("Select a secret to edit its policy, bindings and credential — or add one with +.")
        }
    }

    private func nextDueText(_ record: SecretRecord) -> String {
        guard record.policy.autoRotate else { return "manual" }
        guard let last = record.lastRotatedAt else { return "now" }
        let due = record.policy.nextDue(after: last)
        return due <= Date() ? "now" : "\(due.formatted(.relative(presentation: .named)))"
    }
}

// MARK: - Add secret sheet

private struct AddSecretSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var connectorId: String = ConnectorRegistry.all.first?.id ?? "aws.iam"
    @State private var note = ""
    @State private var intervalHours = 24 * 30
    @State private var autoRotate = false
    @State private var verifyAfterWrite = true
    @State private var adminCredential = ""
    @State private var settings: [String: String] = [:]
    @State private var errorMessage: String?
    @State private var isSaving = false

    private var descriptor: ConnectorDescriptor? {
        ConnectorRegistry.descriptor(for: connectorId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Add managed secret")
                .font(.title3).fontWeight(.semibold)

            Form {
                TextField("Name (e.g. STRIPE_RESTRICTED_KEY)", text: $name)
                Picker("Connector", selection: $connectorId) {
                    ForEach(ConnectorRegistry.all) { descriptor in
                        Text("\(descriptor.displayName) (\(descriptor.capability.rawValue))")
                            .tag(descriptor.id)
                    }
                }
                if let descriptor {
                    Text(descriptor.mechanism)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Stepper("Rotate every \(intervalHours) h", value: $intervalHours, in: 1...8760)
                Toggle("Auto-rotate when due", isOn: $autoRotate)
                Toggle("Verify after write", isOn: $verifyAfterWrite)
                TextField("Note (optional)", text: $note)
            }
            .formStyle(.grouped)

            // Dynamic connector settings.
            let fields = ConnectorFieldCatalog.fields(for: connectorId)
            if !fields.isEmpty {
                SectionLabel(title: "Connector settings")
                Form {
                    ForEach(fields) { field in
                        TextField(field.label,
                                  text: binding(for: field.key),
                                  prompt: Text(field.placeholder))
                    }
                }
                .formStyle(.grouped)
            }

            // Admin credential → Keychain.
            SectionLabel(title: "Admin credential")
            SecureField(descriptor?.adminCredentialHint ?? "Admin credential",
                        text: $adminCredential)
                .textFieldStyle(.roundedBorder)
            Text("Stored in the Keychain only — never on disk. Access group: $(AppIdentifierPrefix)com.autorotate.shared.")
                .font(.caption2)
                .foregroundStyle(.secondary)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(AutorotateTheme.danger)
            }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button(isSaving ? "Saving…" : "Add Secret") { save() }
                    .buttonStyle(.borderedProminent)
                    .tint(AutorotateTheme.accent)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
        .padding(20)
        .frame(width: 520, height: 640)
        .onChange(of: connectorId) { _, _ in settings = [:] }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(get: { settings[key] ?? "" },
                set: { settings[key] = $0 })
    }

    private func save() {
        isSaving = true
        let policy = RotationPolicy(intervalHours: intervalHours,
                                    autoRotate: autoRotate,
                                    verifyAfterWrite: verifyAfterWrite)
        let trimmedSettings = settings.filter { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }
        let credential = adminCredential.isEmpty ? nil : adminCredential
        Task {
            do {
                let record = try await appState.registerSecret(
                    name: name.trimmingCharacters(in: .whitespaces),
                    connectorId: connectorId,
                    connectorConfig: trimmedSettings,
                    adminCredential: credential,
                    policy: policy,
                    note: note)
                _ = record
                dismiss()
            } catch {
                errorMessage = String(describing: error)
            }
            isSaving = false
            // Clear the in-memory field copy as soon as possible.
            adminCredential = ""
        }
    }
}

// MARK: - Secret detail editor

private struct SecretDetailView: View {
    @Environment(AppState.self) private var appState
    @Query(sort: \FileTargetEntity.createdAt) private var fileTargetEntities: [FileTargetEntity]

    let entity: SecretEntity

    // Editable draft state (reset whenever the selection changes — see .id()).
    @State private var record: SecretRecord
    @State private var connectorConfig: [String: String]
    @State private var credentialInput = ""
    @State private var showRotateConfirm = false
    @State private var showImportSheet = false
    @State private var importedValue = ""
    @State private var showAddBinding = false
    @State private var message: String?
    @State private var isRotating = false
    @State private var isDirty = false
    /// Set while programmatically refreshing `record` after a rotation so
    /// the refresh isn't misread as a user edit.
    @State private var suppressDirtyTracking = false

    init(entity: SecretEntity) {
        self.entity = entity
        _record = State(initialValue: entity.toRecord())
        _connectorConfig = State(initialValue: entity.connectorConfig)
    }

    private var descriptor: ConnectorDescriptor? {
        ConnectorRegistry.descriptor(for: record.connectorId)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                rotateSection
                policySection
                bindingsSection
                connectorSection
                credentialSection
                if let message {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.textSecondary)
                }
            }
            .padding(20)
        }
        .confirmationDialog("Rotate \(record.name) now?",
                            isPresented: $showRotateConfirm,
                            titleVisibility: .visible) {
            Button("Rotate Now") { performRotate(imported: nil) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Runs LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT and writes the new value to \(record.targets.filter(\.enabled).count) enabled target(s).")
        }
        .sheet(isPresented: $showImportSheet) { importSheet }
        .sheet(isPresented: $showAddBinding) {
            AddBindingSheet(record: record, fileTargets: fileTargetEntities) { binding in
                record.targets.append(binding)
                isDirty = true
                save()
            }
        }
        .onChange(of: record) { _, _ in
            if suppressDirtyTracking {
                suppressDirtyTracking = false
            } else {
                isDirty = true
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: AutorotateTheme.statusIcon(record.status))
                    .foregroundStyle(AutorotateTheme.statusColor(record.status))
                Text(record.name)
                    .font(.title3).fontWeight(.semibold)
                Spacer()
                FingerprintChip(fingerprint: record.fingerprint)
            }
            HStack(spacing: 12) {
                Text(descriptor?.displayName ?? record.connectorId)
                Text("v\(record.version)")
                if let last = record.lastRotatedAt {
                    Text("rotated \(last, style: .relative) ago")
                } else {
                    Text("never rotated")
                }
            }
            .font(.caption)
            .foregroundStyle(AutorotateTheme.textSecondary)
            if let note = record.note {
                Text(note).font(.caption).foregroundStyle(AutorotateTheme.textSecondary)
            }
        }
    }

    // MARK: Rotate

    private var rotateSection: some View {
        AutorotateCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Rotation")
                        .font(.headline)
                    if descriptor?.capability == .updateOnly {
                        Text("Update-only platform: rotate in the provider UI, then import the new value here.")
                            .font(.caption)
                            .foregroundStyle(AutorotateTheme.warning)
                    } else if descriptor?.capability == .partial {
                        Text("Partially programmatic: API rotation where supported, otherwise import a manually rotated value.")
                            .font(.caption)
                            .foregroundStyle(AutorotateTheme.textSecondary)
                    }
                }
                Spacer()
                if descriptor?.capability == .updateOnly {
                    Button("Import new value…") { showImportSheet = true }
                        .buttonStyle(.borderedProminent)
                        .tint(AutorotateTheme.accent)
                } else {
                    Button(isRotating ? "Rotating…" : "Rotate Now") { showRotateConfirm = true }
                        .buttonStyle(.borderedProminent)
                        .tint(AutorotateTheme.accent)
                        .disabled(isRotating)
                }
                if descriptor?.capability != .updateOnly {
                    Button("Import…") { showImportSheet = true }
                        .buttonStyle(.bordered)
                        .help("Import a value rotated manually in the provider UI")
                }
            }
        }
    }

    private var importSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Import manually rotated value")
                .font(.headline)
            Text("Paste the value you just rotated in the provider UI. It is held in memory, fingerprinted (sha256[0:8]) and pushed to every enabled target — never persisted by Autorotate.")
                .font(.caption)
                .foregroundStyle(.secondary)
            SecureField("New value", text: $importedValue)
                .textFieldStyle(.roundedBorder)
            HStack {
                Spacer()
                Button("Cancel") {
                    importedValue = ""
                    showImportSheet = false
                }
                Button("Import & Propagate") {
                    let value = importedValue
                    importedValue = ""
                    showImportSheet = false
                    performRotate(imported: value)
                }
                .buttonStyle(.borderedProminent)
                .tint(AutorotateTheme.accent)
                .disabled(importedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private func performRotate(imported: String?) {
        isRotating = true
        Task {
            let run = await appState.rotationService.rotateNow(secretId: record.id,
                                                               importedValue: imported)
            // Refresh the local record copy with the committed state.
            if let fresh = try? await appState.secretStore.secret(id: record.id) {
                suppressDirtyTracking = true
                record = fresh
            }
            message = "Run \(run.status.rawValue) — \(run.steps.count) steps, fingerprint \(run.fingerprint ?? "none")."
            isRotating = false
        }
    }

    // MARK: Policy editor

    private var policySection: some View {
        AutorotateCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Rotation policy").font(.headline)
                Stepper("Interval: \(record.policy.intervalHours) h",
                        value: $record.policy.intervalHours, in: 1...8760)
                Toggle("Auto-rotate when due (scheduler)", isOn: $record.policy.autoRotate)
                Toggle("Verify after write (read-back)", isOn: $record.policy.verifyAfterWrite)
                Stepper("Max retries: \(record.policy.maxRetries)",
                        value: $record.policy.maxRetries, in: 0...5)
                if isDirty {
                    Button("Save changes") { save() }
                        .buttonStyle(.borderedProminent)
                        .tint(AutorotateTheme.accent)
                }
            }
        }
    }

    // MARK: Target bindings

    private var bindingsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel(title: "Target bindings")
                Spacer()
                Button { showAddBinding = true } label: {
                    Label("Add target", systemImage: "plus")
                }
                .controlSize(.small)
            }
            if record.targets.isEmpty {
                AutorotateCard {
                    Text("No targets — rotations produce a value but write it nowhere.")
                        .font(.caption)
                        .foregroundStyle(AutorotateTheme.warning)
                }
            } else {
                ForEach(Array(record.targets.enumerated()), id: \.element.id) { index, binding in
                    AutorotateCard {
                        HStack(spacing: 10) {
                            Image(systemName: bindingIcon(binding.kind))
                                .foregroundStyle(AutorotateTheme.accent)
                                .frame(width: 18)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(bindingSummary(binding))
                                    .font(.caption)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Text("\(binding.kind.rawValue)\(binding.required ? " · required" : " · optional")")
                                    .font(.caption2)
                                    .foregroundStyle(AutorotateTheme.textSecondary)
                            }
                            Spacer()
                            Toggle("", isOn: enabledBinding(for: index))
                                .labelsHidden()
                                .toggleStyle(.switch)
                                .controlSize(.small)
                            Button(role: .destructive) {
                                record.targets.removeAll { $0.id == binding.id }
                                save()
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(AutorotateTheme.danger)
                        }
                    }
                }
            }
        }
    }

    private func enabledBinding(for index: Int) -> Binding<Bool> {
        Binding(
            get: { record.targets[index].enabled },
            set: { newValue in
                record.targets[index] = record.targets[index].withEnabled(newValue)
                save()
            })
    }

    private func bindingIcon(_ kind: TargetKind) -> String {
        switch kind {
        case .infisical: return "cloud.fill"
        case .file:      return "doc.text.fill"
        case .webhook:   return "antenna.radiowaves.left.and.right"
        case .keychain:  return "lock.rectangle.fill"
        }
    }

    private func bindingSummary(_ binding: TargetBinding) -> String {
        switch binding {
        case .infisical(let c): return "\(c.baseUrl.host ?? "infisical") · \(c.environment)\(c.secretPath) · \(c.secretName)"
        case .file(let c):      return "\(c.path) · \(c.section.map { "[\($0)] " } ?? "")\(c.keyPath)"
        case .webhook(let c):   return c.url.absoluteString
        case .keychain(let c):  return "Keychain · \(c.account)\(c.synchronizable ? " · iCloud" : "")"
        }
    }

    // MARK: Connector settings

    private var connectorSection: some View {
        let fields = ConnectorFieldCatalog.fields(for: record.connectorId)
        return Group {
            if !fields.isEmpty {
                AutorotateCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Connector settings").font(.headline)
                        ForEach(fields) { field in
                            LabeledContent(field.label) {
                                TextField(field.placeholder,
                                          text: configBinding(for: field.key))
                                    .textFieldStyle(.roundedBorder)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                    }
                }
            }
        }
    }

    private func configBinding(for key: String) -> Binding<String> {
        Binding(
            get: { connectorConfig[key] ?? "" },
            set: {
                connectorConfig[key] = $0
                isDirty = true
            })
    }

    // MARK: Admin credential

    private var credentialSection: some View {
        AutorotateCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Admin credential").font(.headline)
                    Spacer()
                    StatusBadge(
                        color: appState.hasAdminCredential(for: record) ? AutorotateTheme.accent : AutorotateTheme.danger,
                        label: appState.hasAdminCredential(for: record) ? "stored in Keychain" : "missing")
                }
                if let hint = descriptor?.adminCredentialHint {
                    Text(hint).font(.caption).foregroundStyle(AutorotateTheme.textSecondary)
                }
                HStack {
                    SecureField("Replace credential…", text: $credentialInput)
                        .textFieldStyle(.roundedBorder)
                    Button("Store") {
                        save()
                    }
                    .disabled(credentialInput.isEmpty)
                }
                Text("The credential is written straight to the Keychain (device-local, never synchronizable) and the field is cleared.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Save

    private func save() {
        let draft = record
        let config = connectorConfig.filter { !$0.value.isEmpty }
        let credential = credentialInput.isEmpty ? nil : credentialInput
        credentialInput = ""
        isDirty = false
        Task {
            do {
                try await appState.saveSecretEdits(draft,
                                                   connectorConfig: config,
                                                   newAdminCredential: credential)
                message = "Saved."
            } catch {
                message = "Save failed: \(String(describing: error))"
            }
        }
    }
}

// MARK: - withEnabled helper

extension TargetBinding {
    /// Returns a copy of the binding with `enabled` flipped.
    func withEnabled(_ enabled: Bool) -> TargetBinding {
        switch self {
        case .infisical(var c): c.enabled = enabled; return .infisical(c)
        case .file(var c):      c.enabled = enabled; return .file(c)
        case .webhook(var c):   c.enabled = enabled; return .webhook(c)
        case .keychain(var c):  c.enabled = enabled; return .keychain(c)
        }
    }
}

// MARK: - Add target binding sheet

private struct AddBindingSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let record: SecretRecord
    let fileTargets: [FileTargetEntity]
    let onAdd: (TargetBinding) -> Void

    @State private var kind: TargetKind = .file
    @State private var required = true
    // File
    @State private var selectedFileTargetId: UUID?
    @State private var keyPath = ""
    @State private var section = ""
    // Infisical
    @State private var infisicalSecretName = ""
    // Webhook
    @State private var webhookURL = ""
    @State private var includeSecretValue = false
    // Keychain
    @State private var keychainAccount = ""
    @State private var keychainSync = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Add target binding")
                .font(.headline)
            Picker("Kind", selection: $kind) {
                ForEach(TargetKind.allCases, id: \.self) { kind in
                    Text(kind.rawValue).tag(kind)
                }
            }
            .pickerStyle(.segmented)

            Form {
                switch kind {
                case .file:
                    if fileTargets.isEmpty {
                        Text("No file targets registered yet — add files in the File Targets section first.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("File", selection: $selectedFileTargetId) {
                            ForEach(fileTargets, id: \.id) { entity in
                                Text(entity.displayPath).tag(Optional(entity.id))
                            }
                        }
                        TextField("Key path (dot path for JSON)", text: $keyPath)
                        TextField("Section / INI profile (optional)", text: $section)
                    }
                case .infisical:
                    TextField("Secret name in Infisical", text: $infisicalSecretName)
                    Text("Uses the workspace/environment/path from Settings.")
                        .font(.caption).foregroundStyle(.secondary)
                case .webhook:
                    TextField("https://…", text: $webhookURL)
                    Toggle("Include plaintext value in payload (not recommended)",
                           isOn: $includeSecretValue)
                case .keychain:
                    TextField("Account (default: secret name)", text: $keychainAccount)
                    Toggle("Sync via iCloud Keychain (if allowed)",
                           isOn: $keychainSync)
                }
                Toggle("Required (failure fails the run)", isOn: $required)
            }
            .formStyle(.grouped)

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Add Binding") { add() }
                    .buttonStyle(.borderedProminent)
                    .tint(AutorotateTheme.accent)
                    .disabled(!canAdd)
            }
        }
        .padding(20)
        .frame(width: 480, height: 420)
        .onAppear {
            selectedFileTargetId = fileTargets.first?.id
            infisicalSecretName = record.name
            keychainSync = appState.settings.iCloudKeychainSyncEnabled
        }
    }

    private var canAdd: Bool {
        switch kind {
        case .file:      return selectedFileTargetId != nil && !keyPath.isEmpty
        case .infisical: return !infisicalSecretName.isEmpty && appState.settings.infisicalConfigured
        case .webhook:   return URL(string: webhookURL) != nil && !webhookURL.isEmpty
        case .keychain:  return true
        }
    }

    private func add() {
        let binding: TargetBinding?
        switch kind {
        case .file:
            guard let entity = fileTargets.first(where: { $0.id == selectedFileTargetId }) else { return }
            binding = .file(FileTargetConfig(
                required: required,
                path: entity.displayPath,
                format: entity.format,
                keyPath: keyPath,
                section: section.isEmpty ? nil : section))
        case .infisical:
            binding = .infisical(InfisicalTargetConfig(
                required: required,
                baseUrl: appState.settings.infisicalURL,
                workspaceId: appState.settings.infisicalWorkspaceId,
                environment: appState.settings.infisicalEnvironment,
                secretPath: appState.settings.infisicalSecretPath,
                secretName: infisicalSecretName))
        case .webhook:
            guard let url = URL(string: webhookURL) else { return }
            binding = .webhook(WebhookTargetConfig(
                required: required,
                url: url,
                includeSecretValue: includeSecretValue))
        case .keychain:
            binding = .keychain(KeychainTargetConfig(
                required: required,
                account: keychainAccount.isEmpty ? record.name : keychainAccount,
                synchronizable: keychainSync))
        }
        if let binding {
            onAdd(binding)
            dismiss()
        }
    }
}
