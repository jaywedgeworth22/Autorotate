//
//  SecretsListView.swift
//  Autorotate-iOS
//
//  Tracked secrets: status dots, masked values (fingerprints only — values
//  never appear in UI), per-secret "Rotate Now" with confirmation, and
//  navigation to the detail/policy/target editor.
//

import SwiftUI
import SwiftData
import AutorotateCore

struct SecretsListView: View {

    @Environment(AppModel.self) private var model
    @Query(sort: \SDSecretRecord.createdAt) private var rows: [SDSecretRecord]

    @State private var showingAddSecret = false
    @State private var showingImportEnv = false
    @State private var showingQRScanner = false
    @State private var rotationCandidate: SecretRecord?
    @State private var showingRotateConfirmation = false
    @State private var lastRunResult: RotationRun?
    @State private var showingRunResult = false

    private var secrets: [SecretRecord] { rows.compactMap { $0.toRecord() } }

    var body: some View {
        NavigationStack {
            Group {
                if secrets.isEmpty {
                    EmptyStateView(
                        systemImage: "key.slash",
                        title: "No secrets tracked",
                        message: "Add a secret to start rotating it across Infisical, files, webhooks and the Keychain.")
                    .autoRotateScreenBackground()
                } else {
                    List {
                        ForEach(secrets) { secret in
                            NavigationLink {
                                SecretDetailView(secretId: secret.id)
                            } label: {
                                SecretRowView(secret: secret,
                                              isRotating: model.rotatingSecretIds.contains(secret.id)) {
                                    rotationCandidate = secret
                                    showingRotateConfirmation = true
                                }
                            }
                            .listRowBackground(Theme.surface)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { try? await model.deleteSecret(secret) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .autoRotateScreenBackground()
                }
            }
            .navigationTitle("Secrets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showingQRScanner = true
                    } label: {
                        Image(systemName: "qrcode.viewfinder")
                    }
                    .accessibilityLabel("Scan Pairing QR")

                    Button {
                        showingImportEnv = true
                    } label: {
                        Image(systemName: "square.and.arrow.down")
                    }
                    .accessibilityLabel("Import .env")

                    Button {
                        showingAddSecret = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add Secret")
                }
            }
            .sheet(isPresented: $showingAddSecret) {
                AddSecretView()
            }
            .sheet(isPresented: $showingImportEnv) {
                ImportEnvView()
            }
            .sheet(isPresented: $showingQRScanner) {
                QRCodeScannerView()
            }
            .confirmationDialog(
                "Rotate “\(rotationCandidate?.name ?? "")” now?",
                isPresented: $showingRotateConfirmation,
                titleVisibility: .visible
            ) {
                Button("Rotate Now") {
                    guard let secret = rotationCandidate else { return }
                    Task { await rotate(secret) }
                }
                Button("Cancel", role: .cancel) { rotationCandidate = nil }
            } message: {
                if let secret = rotationCandidate {
                    Text("Runs LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT against \(secret.targets.filter(\.enabled).count) enabled target(s).")
                }
            }
            .alert("Rotation \(lastRunResult?.status.displayName ?? "")",
                   isPresented: $showingRunResult) {
                Button("OK", role: .cancel) {}
            } message: {
                if let run = lastRunResult {
                    Text(runSummary(run))
                }
            }
        }
    }

    private func rotate(_ secret: SecretRecord) async {
        // For programmatic connectors this runs the full pipeline. For
        // update-only/partial connectors without an imported value the
        // ROTATE step reports "manual rotation required" — import the new
        // value from the detail screen instead.
        let run = await model.rotateNow(secret)
        if run.status != .committed {
            lastRunResult = run
            showingRunResult = true
        }
        rotationCandidate = nil
    }

    private func runSummary(_ run: RotationRun) -> String {
        let failed = run.steps.filter { $0.status == .failed }
        guard let first = failed.first else { return "Run finished with status \(run.status.displayName)." }
        return "\(first.step.displayName): \(first.detail ?? "failed")"
    }
}

// MARK: - Row

struct SecretRowView: View {
    let secret: SecretRecord
    let isRotating: Bool
    let onRotate: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            StatusDot(status: secret.status)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(secret.name)
                        .font(.callout)
                        .fontWeight(.medium)
                        .foregroundStyle(Theme.text)
                    if secret.policy.autoRotate {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.caption2)
                            .foregroundStyle(Theme.accent)
                    }
                }
                Text(secret.connectorDisplayName)
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
                HStack(spacing: 8) {
                    // Values are never displayed — masked placeholder only.
                    Text("••••••••")
                        .font(Theme.mono(.caption2))
                        .foregroundStyle(Theme.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.surfaceRaised)
                        .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
                        .clipShape(Capsule())
                    FingerprintChip(fingerprint: secret.fingerprint)
                    if let lastRotatedAt = secret.lastRotatedAt {
                        Text(lastRotatedAt, style: .relative)
                            .font(Theme.mono(.caption2))
                            .foregroundStyle(Theme.textSecondary)
                    } else {
                        Text("never rotated")
                            .font(Theme.mono(.caption2))
                            .foregroundStyle(Theme.warning)
                    }
                }
            }
            Spacer()
            Button {
                onRotate()
            } label: {
                if isRotating {
                    ProgressView()
                        .frame(width: 28, height: 28)
                } else {
                    Image(systemName: "arrow.clockwise.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Theme.accent)
                        .frame(width: 28, height: 28)
                }
            }
            .buttonStyle(.plain)
            .disabled(isRotating || secret.status == .disabled)
            .accessibilityLabel("Rotate \(secret.name) now")
        }
        .padding(.vertical, 4)
    }
}
