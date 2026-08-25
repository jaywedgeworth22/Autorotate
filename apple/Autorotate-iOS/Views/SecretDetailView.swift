//
//  SecretDetailView.swift
//  Autorotate-iOS
//
//  Secret detail: status + fingerprint, rotation actions (incl. manual value
//  import for update-only/partial connectors), policy editor (interval,
//  auto-rotate, verify-after-write, retries) and target bindings
//  (Infisical / file / webhook / Keychain) with add/enable/remove.
//

import SwiftUI
import SwiftData
import AutorotateCore

struct SecretDetailView: View {

    let secretId: UUID

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Query private var rows: [SDSecretRecord]
    @Query(sort: \SDRotationRun.startedAt, order: .reverse) private var runRows: [SDRotationRun]

    @State private var intervalHours: Double = 24 * 30
    @State private var autoRotate = false
    @State private var verifyAfterWrite = true
    @State private var maxRetries: Double = 1
    @State private var policyLoaded = false

    @State private var showingAddTarget = false
    @State private var showingImportSheet = false
    @State private var importedValue = ""
    @State private var showingCredentialSheet = false
    @State private var newCredential = ""
    @State private var showingDeleteConfirm = false
    @State private var showingRotateConfirmation = false
    @State private var errorMessage: String?

    // Dismissable binding for the error alert.
    private var errorAlertBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    init(secretId: UUID) {
        self.secretId = secretId
        _rows = Query(filter: #Predicate<SDSecretRecord> { $0.id == secretId })
    }

    private var secret: SecretRecord? { rows.first?.toRecord() }

    private var runs: [RotationRun] {
        runRows.filter { $0.secretId == secretId }.prefix(20).compactMap { $0.toRun() }
    }

    var body: some View {
        Group {
            if let secret {
                detailContent(secret)
            } else {
                EmptyStateView(systemImage: "questionmark.key", title: "Secret not found")
            }
        }
        .autoRotateScreenBackground()
        .navigationTitle(secret?.name ?? "Secret")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingAddTarget) {
            if let secret {
                AddTargetView(secret: secret)
            }
        }
        .alert("Import rotated value", isPresented: $showingImportSheet) {
            SecureField("New value from provider UI", text: $importedValue)
            Button("Rotate with this value") {
                let value = importedValue
                importedValue = ""
                if let secret {
                    Task { await model.rotateNow(secret, importedValue: value) }
                }
            }
            Button("Cancel", role: .cancel) { importedValue = "" }
        } message: {
            Text("The value is validated, fingerprinted and pushed to targets. It is never stored by Autorotate.")
        }
        .alert("Update admin credential", isPresented: $showingCredentialSheet) {
            SecureField("Admin credential", text: $newCredential)
            Button("Store in Keychain") {
                let value = newCredential
                newCredential = ""
                if let secret, !value.isEmpty {
                    try? model.updateAdminCredential(value, for: secret)
                }
            }
            Button("Cancel", role: .cancel) { newCredential = "" }
        } message: {
            Text("Stored only in the Apple Keychain, never on disk, never synchronized to iCloud.")
        }
        .confirmationDialog("Rotate now?", isPresented: $showingRotateConfirmation, titleVisibility: .visible) {
            Button("Rotate Now") {
                if let secret { Task { await model.rotateNow(secret) } }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Delete this secret?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Delete Secret", role: .destructive) {
                if let secret {
                    Task {
                        try? await model.deleteSecret(secret)
                        dismiss()
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Removes the record, its connector config, admin credential and managed keychain item.")
        }
        .alert("Error", isPresented: errorAlertBinding) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: Content

    @ViewBuilder
    private func detailContent(_ secret: SecretRecord) -> some View {
        List {
            statusSection(secret)
            actionsSection(secret)
            policySection(secret)
            targetsSection(secret)
            credentialSection(secret)
            runsSection(secret)
            dangerSection
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .onAppear { loadPolicy(secret) }
    }

    private func statusSection(_ secret: SecretRecord) -> some View {
        Section {
            HStack(spacing: 10) {
                StatusDot(status: secret.status, size: 10)
                VStack(alignment: .leading, spacing: 4) {
                    Text(secret.name)
                        .font(.headline)
                        .foregroundStyle(Theme.text)
                    Text(secret.connectorDisplayName)
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer()
                if let capability = secret.connectorCapability {
                    CapabilityBadge(capability: capability)
                }
            }
            HStack {
                Text("Fingerprint")
                    .foregroundStyle(Theme.textSecondary)
                Spacer()
                FingerprintChip(fingerprint: secret.fingerprint)
            }
            LabeledContent("Version", value: "\(secret.version)")
            LabeledContent("Last rotated") {
                if let last = secret.lastRotatedAt {
                    Text(last, style: .relative)
                } else {
                    Text("never").foregroundStyle(Theme.warning)
                }
            }
            if let next = secret.nextDueDate(), secret.policy.autoRotate {
                LabeledContent("Next due") {
                    Text(next, style: .relative)
                        .foregroundStyle(next <= Date() ? Theme.danger : Theme.text)
                }
            }
        } header: {
            InstrumentSectionHeader(title: "Status", systemImage: "info.circle")
        }
        .listRowBackground(Theme.surface)
    }

    private func actionsSection(_ secret: SecretRecord) -> some View {
        Section {
            if secret.connectorCapability == .programmatic {
                Button {
                    showingRotateConfirmation = true
                } label: {
                    Label("Rotate Now", systemImage: "arrow.clockwise.circle.fill")
                        .foregroundStyle(Theme.accent)
                }
                .disabled(model.rotatingSecretIds.contains(secret.id))
            } else {
                Button {
                    showingImportSheet = true
                } label: {
                    Label("Import rotated value…", systemImage: "square.and.arrow.down")
                        .foregroundStyle(Theme.accent)
                }
                Text("This platform is \(secret.connectorCapability == .updateOnly ? "update-only" : "partially programmatic"). Rotate in the provider UI, then import the new value — Autorotate propagates it to all targets.")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
        } header: {
            InstrumentSectionHeader(title: "Rotation", systemImage: "arrow.triangle.2.circlepath")
        }
        .listRowBackground(Theme.surface)
    }

    private func policySection(_ secret: SecretRecord) -> some View {
        Section {
            VStack(alignment: .leading) {
                Text("Interval: \(Int(intervalHours)) hours")
                    .font(.callout)
                Slider(value: $intervalHours, in: 1...(24 * 90), step: 1)
                    .tint(Theme.accent)
            }
            Toggle("Auto-rotate when due", isOn: $autoRotate)
                .tint(Theme.accent)
            Toggle("Verify after write", isOn: $verifyAfterWrite)
                .tint(Theme.accent)
            Stepper("Max retries: \(Int(maxRetries))", value: $maxRetries, in: 0...5)
            Button("Save Policy") {
                Task {
                    let policy = RotationPolicy(intervalHours: Int(intervalHours),
                                                autoRotate: autoRotate,
                                                verifyAfterWrite: verifyAfterWrite,
                                                maxRetries: Int(maxRetries))
                    do {
                        try await model.updatePolicy(for: secret, policy: policy)
                    } catch {
                        errorMessage = "Failed to save policy: \(error.localizedDescription)"
                    }
                }
            }
            .foregroundStyle(Theme.accent)
            .disabled(!policyDirty(secret))
        } header: {
            InstrumentSectionHeader(title: "Policy", systemImage: "slider.horizontal.3")
        }
        .listRowBackground(Theme.surface)
        .onChange(of: secret.id) { _, _ in policyLoaded = false }
    }

    private func targetsSection(_ secret: SecretRecord) -> some View {
        Section {
            if secret.targets.isEmpty {
                Text("No targets — rotations produce a value but push it nowhere.")
                    .font(.caption)
                    .foregroundStyle(Theme.warning)
            }
            ForEach(secret.targets) { target in
                TargetRowView(secret: secret, target: target)
            }
            .onDelete { indexSet in
                var targets = secret.targets
                targets.remove(atOffsets: indexSet)
                Task { try? await model.updateTargets(for: secret, targets: targets) }
            }
            Button {
                showingAddTarget = true
            } label: {
                Label("Add Target", systemImage: "plus.circle.fill")
                    .foregroundStyle(Theme.accent)
            }
        } header: {
            InstrumentSectionHeader(title: "Targets", systemImage: "target")
        }
        .listRowBackground(Theme.surface)
    }

    private func credentialSection(_ secret: SecretRecord) -> some View {
        Section {
            HStack {
                Label {
                    Text("Admin credential")
                } icon: {
                    Image(systemName: model.hasAdminCredential(for: secret) ? "checkmark.lock.fill" : "exclamationmark.lock")
                        .foregroundStyle(model.hasAdminCredential(for: secret) ? Theme.accent : Theme.warning)
                }
                Spacer()
                Text(model.hasAdminCredential(for: secret) ? "in Keychain" : "missing")
                    .font(Theme.mono(.caption2))
                    .foregroundStyle(Theme.textSecondary)
            }
            Button("Replace credential…") { showingCredentialSheet = true }
                .foregroundStyle(Theme.accent)
        } header: {
            InstrumentSectionHeader(title: "Credential", systemImage: "lock.shield")
        }
        .listRowBackground(Theme.surface)
    }

    private func runsSection(_ secret: SecretRecord) -> some View {
        Section {
            if runs.isEmpty {
                Text("No runs yet.")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
            ForEach(runs) { run in
                NavigationLink {
                    RunDetailView(run: run, secretName: secret.name)
                } label: {
                    HStack {
                        Image(systemName: Theme.icon(for: run.status == .committed ? .succeeded : (run.status == .running ? .skipped : .failed)))
                            .foregroundStyle(Theme.color(for: run.status))
                        Text(run.startedAt, style: .relative)
                            .font(.callout)
                            .foregroundStyle(Theme.text)
                        Spacer()
                        RunStatusBadge(status: run.status)
                    }
                }
            }
        } header: {
            InstrumentSectionHeader(title: "Recent runs", systemImage: "list.bullet.rectangle")
        }
        .listRowBackground(Theme.surface)
    }

    private var dangerSection: some View {
        Section {
            Button("Delete Secret", role: .destructive) {
                showingDeleteConfirm = true
            }
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: Helpers

    private func loadPolicy(_ secret: SecretRecord) {
        guard !policyLoaded else { return }
        intervalHours = Double(secret.policy.intervalHours)
        autoRotate = secret.policy.autoRotate
        verifyAfterWrite = secret.policy.verifyAfterWrite
        maxRetries = Double(secret.policy.maxRetries)
        policyLoaded = true
    }

    private func policyDirty(_ secret: SecretRecord) -> Bool {
        Int(intervalHours) != secret.policy.intervalHours
            || autoRotate != secret.policy.autoRotate
            || verifyAfterWrite != secret.policy.verifyAfterWrite
            || Int(maxRetries) != secret.policy.maxRetries
    }
}

// MARK: - Target row

private struct TargetRowView: View {
    @Environment(AppModel.self) private var model
    let secret: SecretRecord
    let target: TargetBinding

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: Theme.icon(for: target.kind))
                .foregroundStyle(target.enabled ? Theme.accent : Theme.neutral)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(target.kind.rawValue.uppercased())
                    if target.required { Text("REQUIRED") } else { Text("OPTIONAL") }
                }
                .font(Theme.sectionLabel())
                .foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            Toggle("", isOn: enabledBinding)
                .labelsHidden()
                .tint(Theme.accent)
        }
    }

    private var summary: String {
        switch target {
        case .infisical(let c):
            return "\(c.environment)\(c.secretPath)/\(c.secretName)"
        case .file(let c):
            return "\(c.path) [\(c.format.rawValue)] \(c.keyPath)"
        case .webhook(let c):
            return c.url.host ?? c.url.absoluteString
        case .keychain(let c):
            return "\(c.account)\(c.synchronizable ? " · iCloud" : " · local")"
        }
    }

    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { target.enabled },
            set: { newValue in
                var targets = secret.targets
                guard let index = targets.firstIndex(where: { $0.id == target.id }) else { return }
                targets[index] = Self.settingEnabled(newValue, on: target)
                Task { try? await model.updateTargets(for: secret, targets: targets) }
            })
    }

    private static func settingEnabled(_ enabled: Bool, on target: TargetBinding) -> TargetBinding {
        switch target {
        case .infisical(var c): c.enabled = enabled; return .infisical(c)
        case .file(var c):      c.enabled = enabled; return .file(c)
        case .webhook(var c):   c.enabled = enabled; return .webhook(c)
        case .keychain(var c):  c.enabled = enabled; return .keychain(c)
        }
    }
}
