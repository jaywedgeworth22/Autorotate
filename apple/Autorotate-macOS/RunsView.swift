//
//  RunsView.swift
//  TopSpin-macOS
//
//  Rotation run history: a list of runs and, for the selected run, the
//  six-step pipeline LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT with
//  per-step status, timing and sanitized logs.
//

import SwiftUI
import SwiftData
import TopSpinCore

struct RunsView: View {
    @Query(sort: \RunEntity.startedAt, order: .reverse) private var runEntities: [RunEntity]
    @Query(sort: \SecretEntity.createdAt) private var secretEntities: [SecretEntity]

    @State private var selection: UUID?

    private func secretName(for id: UUID) -> String {
        secretEntities.first { $0.id == id }?.name ?? id.uuidString.prefix(8).description
    }

    var body: some View {
        HSplitView {
            runList
                .frame(minWidth: 380)
            if let selection,
               let entity = runEntities.first(where: { $0.id == selection }) {
                RunDetailView(run: entity.toRun(), secretName: secretName(for: entity.secretId))
                    .id(entity.id)
                    .frame(minWidth: 420)
            } else {
                ContentUnavailableView {
                    Label("No run selected", systemImage: "list.bullet.rectangle")
                } description: {
                    Text("Runs appear after a rotation — manual, scheduled or imported.")
                }
                .frame(minWidth: 420)
            }
        }
        .navigationTitle("Runs")
    }

    private var runList: some View {
        List(runEntities, selection: $selection) { entity in
            let run = entity.toRun()
            HStack(spacing: 10) {
                Image(systemName: TopSpinTheme.runStatusIcon(run.status))
                    .foregroundStyle(TopSpinTheme.runStatusColor(run.status))
                VStack(alignment: .leading, spacing: 2) {
                    Text(secretName(for: run.secretId))
                        .font(.callout).fontWeight(.medium)
                    HStack(spacing: 6) {
                        Text(run.trigger == .scheduled ? "scheduled" : "manual")
                        Text(run.startedAt, style: .relative)
                    }
                    .font(.caption2)
                    .foregroundStyle(TopSpinTheme.textSecondary)
                }
                Spacer()
                FingerprintChip(fingerprint: run.fingerprint)
            }
            .padding(.vertical, 3)
            .tag(entity.id)
        }
        .listStyle(.inset)
    }
}

// MARK: - Run detail: the pipeline

private struct RunDetailView: View {
    let run: RotationRun
    let secretName: String

    /// Steps in canonical pipeline order, each with all of its results.
    private var orderedSteps: [(step: RotationStep, results: [RotationStepResult])] {
        RotationStep.allCases.map { step in
            (step, run.steps.filter { $0.step == step })
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                pipeline
            }
            .padding(20)
        }
    }

    private var header: some View {
        TopSpinCard {
            HStack(spacing: 14) {
                Image(systemName: TopSpinTheme.runStatusIcon(run.status))
                    .font(.title2)
                    .foregroundStyle(TopSpinTheme.runStatusColor(run.status))
                VStack(alignment: .leading, spacing: 3) {
                    Text(secretName).font(.headline)
                    HStack(spacing: 10) {
                        Text(run.status.rawValue.uppercased())
                            .font(TopSpinTheme.mono(10, weight: .bold))
                            .foregroundStyle(TopSpinTheme.runStatusColor(run.status))
                        Text(run.startedAt, format: .dateTime)
                            .font(.caption)
                            .foregroundStyle(TopSpinTheme.textSecondary)
                        if let finished = run.finishedAt {
                            Text("· \(duration(from: run.startedAt, to: finished))")
                                .font(.caption)
                                .foregroundStyle(TopSpinTheme.textSecondary)
                        }
                    }
                }
                Spacer()
                FingerprintChip(fingerprint: run.fingerprint)
            }
        }
    }

    private var pipeline: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(orderedSteps.enumerated()), id: \.offset) { index, pair in
                PipelineStepRow(index: index + 1,
                                step: pair.step,
                                results: pair.results)
                if index < orderedSteps.count - 1 {
                    Rectangle()
                        .fill(TopSpinTheme.border)
                        .frame(width: 2, height: 14)
                        .padding(.leading, 25)
                }
            }
        }
    }

    private func duration(from start: Date, to end: Date) -> String {
        let seconds = end.timeIntervalSince(start)
        if seconds < 1 { return String(format: "%.0f ms", seconds * 1000) }
        return String(format: "%.1f s", seconds)
    }
}

/// One pipeline step (LOCK … AUDIT) with its per-target results/logs.
private struct PipelineStepRow: View {
    let index: Int
    let step: RotationStep
    let results: [RotationStepResult]

    private var aggregate: RotationStepStatus {
        if results.contains(where: { $0.status == .failed }) { return .failed }
        if results.contains(where: { $0.status == .succeeded }) { return .succeeded }
        return results.isEmpty ? .skipped : .skipped
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(TopSpinTheme.card)
                    .overlay(Circle().stroke(TopSpinTheme.stepStatusColor(aggregate), lineWidth: 1.5))
                    .frame(width: 28, height: 28)
                Text(step.rawValue.prefix(1).uppercased())
                    .font(TopSpinTheme.mono(11, weight: .bold))
                    .foregroundStyle(TopSpinTheme.stepStatusColor(aggregate))
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("\(index). \(step.rawValue.uppercased())")
                        .font(TopSpinTheme.mono(12, weight: .semibold))
                        .foregroundStyle(TopSpinTheme.textPrimary)
                    Spacer()
                    StatusBadge(color: TopSpinTheme.stepStatusColor(aggregate),
                                label: aggregate.rawValue)
                }
                if results.isEmpty {
                    Text("not reached")
                        .font(.caption)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                } else {
                    ForEach(results) { result in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: TopSpinTheme.stepStatusIcon(result.status))
                                .font(.caption2)
                                .foregroundStyle(TopSpinTheme.stepStatusColor(result.status))
                            Text(result.detail ?? result.status.rawValue)
                                .font(.caption)
                                .foregroundStyle(TopSpinTheme.textSecondary)
                                .textSelection(.enabled)
                            Spacer()
                            Text(result.finishedAt, style: .time)
                                .font(.caption2)
                                .foregroundStyle(TopSpinTheme.textSecondary.opacity(0.7))
                        }
                    }
                }
            }
        }
        .padding(10)
        .background(TopSpinTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
