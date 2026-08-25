//
//  DashboardView.swift
//  Autorotate-iOS
//
//  Rotation health summary: stat tiles, due-soon list, recent runs.
//

import SwiftUI
import SwiftData
import AutorotateCore

struct DashboardView: View {

    @Environment(AppModel.self) private var model
    @Query(sort: \SDSecretRecord.createdAt) private var secretRows: [SDSecretRecord]
    @Query(sort: \SDRotationRun.startedAt, order: .reverse) private var runRows: [SDRotationRun]

    private var secrets: [SecretRecord] { secretRows.compactMap { $0.toRecord() } }
    private var recentRuns: [RotationRun] { runRows.prefix(6).compactMap { $0.toRun() } }

    private var activeCount: Int { secrets.filter { $0.status == .active }.count }
    private var dueSoon: [SecretRecord] { secrets.filter { $0.isDueSoon() } }
    private var problemCount: Int { secrets.filter { $0.status == .failed || $0.status == .partial }.count }

    private var healthSummary: (label: String, color: Color) {
        if secrets.isEmpty { return ("NO SECRETS", Theme.neutral) }
        if problemCount > 0 { return ("ATTENTION", Theme.danger) }
        if !dueSoon.isEmpty { return ("DUE SOON", Theme.warning) }
        return ("HEALTHY", Theme.accent)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    healthHeader
                    statGrid
                    dueSoonSection
                    recentRunsSection
                }
                .padding()
            }
            .autoRotateScreenBackground()
            .navigationTitle("Autorotate.Codes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.rotateDueSecretsNow() }
                    } label: {
                        if model.isRotatingDueSecrets {
                            ProgressView()
                        } else {
                            Label("Rotate due", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    .disabled(model.isRotatingDueSecrets || dueSoon.isEmpty)
                }
            }
        }
    }

    // MARK: Sections

    private var healthHeader: some View {
        HStack(spacing: 10) {
            StatusDot(color: healthSummary.color, size: 10)
            Text("ROTATION HEALTH")
                .font(Theme.sectionLabel(.caption))
                .foregroundStyle(Theme.textSecondary)
                .tracking(1.5)
            Spacer()
            Text(healthSummary.label)
                .font(Theme.mono(.caption))
                .fontWeight(.bold)
                .foregroundStyle(healthSummary.color)
        }
    }

    private var statGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatTile(title: "Tracked", value: "\(secrets.count)",
                     color: Theme.text, systemImage: "key.fill")
            StatTile(title: "Active", value: "\(activeCount)",
                     color: Theme.accent, systemImage: "checkmark.shield.fill")
            StatTile(title: "Due soon", value: "\(dueSoon.count)",
                     color: dueSoon.isEmpty ? Theme.text : Theme.warning,
                     systemImage: "clock.badge.exclamationmark")
            StatTile(title: "Failed / partial", value: "\(problemCount)",
                     color: problemCount == 0 ? Theme.text : Theme.danger,
                     systemImage: "exclamationmark.triangle.fill")
        }
    }

    private var dueSoonSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            InstrumentSectionHeader(title: "Due soon", systemImage: "clock")
            if dueSoon.isEmpty {
                Text(secrets.isEmpty
                     ? "No secrets tracked yet — add one from the Secrets tab."
                     : "Nothing is due for rotation in the next 72 hours.")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .instrumentCard()
            } else {
                ForEach(dueSoon) { secret in
                    DashboardSecretRow(secret: secret)
                }
            }
        }
    }

    private var recentRunsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            InstrumentSectionHeader(title: "Recent runs", systemImage: "arrow.triangle.2.circlepath")
            if recentRuns.isEmpty {
                Text("No rotation runs yet.")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .instrumentCard()
            } else {
                ForEach(recentRuns) { run in
                    RunRowView(run: run, secretName: secretName(for: run.secretId))
                }
            }
        }
    }

    private func secretName(for id: UUID) -> String {
        secrets.first { $0.id == id }?.name ?? "deleted secret"
    }
}

// MARK: - Due-soon row

private struct DashboardSecretRow: View {
    let secret: SecretRecord

    var body: some View {
        HStack(spacing: 10) {
            StatusDot(status: secret.status)
            VStack(alignment: .leading, spacing: 3) {
                Text(secret.name)
                    .font(.callout)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.text)
                Text(secret.connectorDisplayName)
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                FingerprintChip(fingerprint: secret.fingerprint)
                if let next = secret.nextDueDate(), next > Date.distantPast {
                    Text(next, style: .relative)
                        .font(Theme.mono(.caption2))
                        .foregroundStyle(next <= Date() ? Theme.danger : Theme.warning)
                } else {
                    Text("never rotated")
                        .font(Theme.mono(.caption2))
                        .foregroundStyle(Theme.warning)
                }
            }
        }
        .padding(12)
        .instrumentCard()
    }
}

// MARK: - Shared run row

/// One rotation run summary row (used by Dashboard and Runs tab).
struct RunRowView: View {
    let run: RotationRun
    let secretName: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: run.trigger == .scheduled ? "clock.arrow.2.circlepath" : "hand.tap.fill")
                .foregroundStyle(Theme.textSecondary)
                .font(.callout)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
                Text(secretName)
                    .font(.callout)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.text)
                HStack(spacing: 6) {
                    Text(run.startedAt, style: .relative)
                    if let fingerprint = run.fingerprint {
                        Text("sha256:\(fingerprint)")
                    }
                }
                .font(Theme.mono(.caption2))
                .foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            RunStatusBadge(status: run.status)
        }
        .padding(12)
        .instrumentCard()
    }
}
