//
//  DashboardView.swift
//  TopSpin-macOS
//
//  Dashboard: rotation-health ring, due queue and recent audit activity.
//  Reads SwiftData via @Query so it stays live as the engine commits runs.
//

import SwiftUI
import SwiftData
import TopSpinCore

struct DashboardView: View {
    @Environment(AppState.self) private var appState

    @Query(sort: \SecretEntity.createdAt) private var secretEntities: [SecretEntity]
    @Query(sort: \RunEntity.startedAt, order: .reverse) private var runEntities: [RunEntity]
    @Query(sort: \AuditEntity.timestamp, order: .reverse) private var auditEntities: [AuditEntity]

    private var records: [SecretRecord] { secretEntities.map { $0.toRecord() } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                healthRow
                dueQueue
                recentActivity
            }
            .padding(24)
        }
        .navigationTitle("Dashboard")
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Rotation health")
                    .font(.title2)
                    .fontWeight(.semibold)
                if let lastTick = appState.scheduler.lastTickAt {
                    Text("Scheduler ticked \(lastTick, style: .relative) ago · every \(appState.settings.schedulerIntervalMinutes) min")
                        .font(.caption)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                } else {
                    Text("Scheduler starting…")
                        .font(.caption)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                }
            }
            Spacer()
            Button {
                Task { await appState.rotationService.rotateDueNow(triggerScheduled: false) }
            } label: {
                Label("Rotate due now", systemImage: "arrow.triangle.2.circlepath")
            }
            .buttonStyle(.borderedProminent)
            .tint(TopSpinTheme.accent)
            .disabled(appState.scheduler.dueCount == 0)
        }
    }

    // MARK: - Health ring + counters

    private var healthRow: some View {
        let health = HealthSummary(records: records, dueCount: appState.scheduler.dueCount)
        return HStack(spacing: 20) {
            TopSpinCard {
                HStack(spacing: 18) {
                    HealthRingView(fraction: health.healthyFraction, color: health.color)
                        .frame(width: 96, height: 96)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(health.headline)
                            .font(.headline)
                        Text("\(health.healthy)/\(health.total) secrets committed & healthy")
                            .font(.caption)
                            .foregroundStyle(TopSpinTheme.textSecondary)
                    }
                    Spacer()
                }
            }
            TopSpinCard {
                HStack(spacing: 24) {
                    counter("Due", value: health.due, color: health.due > 0 ? TopSpinTheme.warning : TopSpinTheme.textSecondary)
                    counter("Failed", value: health.failed, color: health.failed > 0 ? TopSpinTheme.danger : TopSpinTheme.textSecondary)
                    counter("Partial", value: health.partial, color: health.partial > 0 ? TopSpinTheme.warning : TopSpinTheme.textSecondary)
                    counter("Runs", value: runEntities.count, color: TopSpinTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func counter(_ label: String, value: Int, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundStyle(color)
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(TopSpinTheme.textSecondary)
                .tracking(1)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Due queue

    private var dueQueue: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title: "Due queue")
            let due = records.filter { $0.isDue() }
            if due.isEmpty {
                TopSpinCard {
                    Label("Nothing due — all policies satisfied.", systemImage: "checkmark.circle")
                        .foregroundStyle(TopSpinTheme.textSecondary)
                        .font(.callout)
                }
            } else {
                ForEach(due) { record in
                    TopSpinCard {
                        HStack(spacing: 12) {
                            Image(systemName: "clock.badge.exclamationmark")
                                .foregroundStyle(TopSpinTheme.warning)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(record.name).font(.callout).fontWeight(.medium)
                                Text(ConnectorRegistry.descriptor(for: record.connectorId)?.displayName
                                     ?? record.connectorId)
                                    .font(.caption)
                                    .foregroundStyle(TopSpinTheme.textSecondary)
                            }
                            Spacer()
                            FingerprintChip(fingerprint: record.fingerprint)
                            Text(nextDueText(record))
                                .font(.caption)
                                .foregroundStyle(TopSpinTheme.warning)
                            Button("Rotate") {
                                Task { await appState.rotationService.rotateNow(secretId: record.id) }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                }
            }
        }
    }

    private func nextDueText(_ record: SecretRecord) -> String {
        guard let last = record.lastRotatedAt else { return "never rotated" }
        let due = record.policy.nextDue(after: last)
        return "due \(due.formatted(.relative(presentation: .named)))"
    }

    // MARK: - Recent activity (audit log)

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title: "Recent activity")
            let entries = auditEntities.prefix(12)
            if entries.isEmpty {
                TopSpinCard {
                    Text("Audit log is empty. Rotations and credential changes appear here — fingerprints only, never values.")
                        .font(.callout)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                }
            } else {
                TopSpinCard {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(entries)) { entity in
                            let entry = entity.toEntry()
                            HStack(spacing: 10) {
                                Image(systemName: auditIcon(entry.action))
                                    .foregroundStyle(auditColor(entry.action))
                                    .frame(width: 16)
                                Text(entry.action.rawValue)
                                    .font(TopSpinTheme.mono(11))
                                if let secretId = entry.secretId,
                                   let name = records.first(where: { $0.id == secretId })?.name {
                                    Text(name)
                                        .font(.caption)
                                        .foregroundStyle(TopSpinTheme.textSecondary)
                                }
                                Spacer()
                                FingerprintChip(fingerprint: entry.fingerprint)
                                Text(entry.timestamp, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(TopSpinTheme.textSecondary)
                            }
                            .padding(.vertical, 6)
                            if entity.id != entries.last?.id {
                                Divider().overlay(TopSpinTheme.border)
                            }
                        }
                    }
                }
            }
        }
    }

    private func auditIcon(_ action: AuditAction) -> String {
        switch action {
        case .rotationCommitted:    return "checkmark.circle.fill"
        case .rotationStarted:      return "play.circle"
        case .rotationPartial:      return "exclamationmark.triangle.fill"
        case .rotationFailed:       return "xmark.octagon.fill"
        case .rotationSkippedLocked: return "lock.fill"
        case .rollbackFlagged:      return "arrow.uturn.backward.circle.fill"
        case .secretRegistered:     return "plus.circle.fill"
        case .secretDeleted:        return "trash.circle"
        case .targetUpdated:        return "doc.badge.gearshape"
        case .credentialStored:     return "key.fill"
        case .credentialDeleted:    return "key.slash"
        }
    }

    private func auditColor(_ action: AuditAction) -> Color {
        switch action {
        case .rotationCommitted:    return TopSpinTheme.accent
        case .rotationFailed, .rotationPartial, .rollbackFlagged: return TopSpinTheme.danger
        default:                    return TopSpinTheme.textSecondary
        }
    }
}

/// Circular health gauge.
struct HealthRingView: View {
    let fraction: Double
    let color: Color

    var body: some View {
        ZStack {
            Circle()
                .stroke(TopSpinTheme.border, lineWidth: 10)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, fraction)))
                .stroke(color, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.6), value: fraction)
            Text("\(Int((fraction * 100).rounded()))%")
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(TopSpinTheme.textPrimary)
        }
    }
}
