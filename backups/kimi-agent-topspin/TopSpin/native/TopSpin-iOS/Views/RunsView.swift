//
//  RunsView.swift
//  TopSpin-iOS
//
//  Rotation run history with per-run status, and a detail view rendering
//  the six-step pipeline (LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT)
//  with per-step status, timing and sanitized detail strings.
//

import SwiftUI
import SwiftData
import TopSpinCore

struct RunsView: View {

    @Query(sort: \SDRotationRun.startedAt, order: .reverse) private var runRows: [SDRotationRun]
    @Query(sort: \SDSecretRecord.createdAt) private var secretRows: [SDSecretRecord]

    private var runs: [RotationRun] { runRows.prefix(100).compactMap { $0.toRun() } }

    private var namesById: [UUID: String] {
        Dictionary(uniqueKeysWithValues:
            secretRows.compactMap { $0.toRecord() }.map { ($0.id, $0.name) })
    }

    var body: some View {
        NavigationStack {
            Group {
                if runs.isEmpty {
                    EmptyStateView(
                        systemImage: "arrow.triangle.2.circlepath.circle",
                        title: "No rotation runs",
                        message: "Runs appear here after the first manual or scheduled rotation.")
                    .topSpinScreenBackground()
                } else {
                    List(runs) { run in
                        NavigationLink {
                            RunDetailView(run: run,
                                          secretName: namesById[run.secretId] ?? "deleted secret")
                        } label: {
                            RunRowView(run: run,
                                       secretName: namesById[run.secretId] ?? "deleted secret")
                        }
                        .listRowBackground(Theme.surface)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .topSpinScreenBackground()
                }
            }
            .navigationTitle("Rotation Runs")
        }
    }
}

// MARK: - Run detail (pipeline timeline)

struct RunDetailView: View {
    let run: RotationRun
    let secretName: String

    /// One pipeline step plus its results (steps the engine never reached
    /// have an empty results list and render as "not reached").
    struct StepGroup: Identifiable {
        let step: RotationStep
        let results: [RotationStepResult]
        var id: String { step.rawValue }
    }

    /// Ordered view of the six pipeline steps: engine-produced results are
    /// matched per step; steps with no result render as "not reached".
    private var timeline: [StepGroup] {
        RotationStep.allCases.map { step in
            StepGroup(step: step, results: run.steps.filter { $0.step == step })
        }
    }

    var body: some View {
        List {
            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(secretName)
                            .font(.headline)
                            .foregroundStyle(Theme.text)
                        Text(run.startedAt.formatted(date: .abbreviated, time: .standard))
                            .font(Theme.mono(.caption))
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                    RunStatusBadge(status: run.status)
                }
                LabeledContent("Trigger", value: run.trigger.rawValue)
                LabeledContent("Duration") {
                    if let finished = run.finishedAt {
                        Text(finished.timeIntervalSince(run.startedAt),
                             format: .number.precision(.fractionLength(2)))
                        + Text(" s")
                    } else {
                        Text("running…")
                    }
                }
                HStack {
                    Text("Fingerprint")
                    Spacer()
                    FingerprintChip(fingerprint: run.fingerprint)
                }
            } header: {
                InstrumentSectionHeader(title: "Run", systemImage: "play.rectangle")
            }
            .listRowBackground(Theme.surface)

            Section {
                ForEach(timeline) { group in
                    if group.results.isEmpty {
                        HStack(spacing: 10) {
                            Image(systemName: "circle.dashed")
                                .foregroundStyle(Theme.neutral)
                                .frame(width: 20)
                            Text(group.step.displayName)
                                .font(Theme.mono(.caption))
                                .foregroundStyle(Theme.neutral)
                            Spacer()
                            Text("not reached")
                                .font(Theme.mono(.caption2))
                                .foregroundStyle(Theme.neutral)
                        }
                    } else {
                        ForEach(group.results) { result in
                            StepResultRow(result: result)
                        }
                    }
                }
            } header: {
                InstrumentSectionHeader(title: "Pipeline", systemImage: "arrow.triangle.2.circlepath")
            }
            .listRowBackground(Theme.surface)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .topSpinScreenBackground()
        .navigationTitle("Run")
        .navigationBarTitleDisplayMode(.inline)
    }
}
