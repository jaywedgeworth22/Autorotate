//
//  TopSpinMacApp.swift
//  TopSpin-macOS
//
//  App entry point:
//    - a main `WindowGroup` with a sidebar `NavigationSplitView`
//      (Dashboard / Secrets / Runs / File Targets / Settings),
//    - a `MenuBarExtra` companion with the rotation health dot, the due
//      count, a "Rotate due now" button, recent runs and quick links.
//
//  Both scenes share one `AppState` (and one SwiftData container).
//

import SwiftUI
import SwiftData
import AppKit
import TopSpinCore

@main
struct TopSpinMacApp: App {

    @State private var appState: AppState

    init() {
        // AppState (and its @MainActor collaborators) must be constructed on
        // the main actor; App.init is nonisolated on the macOS 14 SDK, so we
        // assert the isolation the runtime guarantees at app launch.
        _appState = State(initialValue: MainActor.assumeIsolated { AppState() })
    }

    var body: some Scene {
        WindowGroup("TopSpin", id: "main") {
            MainWindowView()
                .environment(appState)
                .frame(minWidth: 980, minHeight: 620)
        }
        .modelContainer(appState.container)
        .defaultSize(width: 1180, height: 760)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(after: .sidebar) {
                Button("Rotate Due Secrets Now") {
                    Task { await appState.rotationService.rotateDueNow(triggerScheduled: false) }
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }
        }

        MenuBarExtra("TopSpin", systemImage: menuBarSymbol) {
            MenuBarView()
                .environment(appState)
                .modelContainer(appState.container)
        }
        .menuBarExtraStyle(.window)
    }

    /// Menu bar icon reflects rotation health: plain arrows when healthy,
    /// a filled circle while attention-worthy, warning variant on failures.
    private var menuBarSymbol: String {
        let latest = appState.rotationService.recentRuns.first?.status
        if latest == .failed || latest == .partial {
            return "exclamationmark.arrow.triangle.2.circlepath"
        }
        return appState.scheduler.dueCount > 0
            ? "arrow.triangle.2.circlepath.circle.fill"
            : "arrow.triangle.2.circlepath"
    }
}

// MARK: - Sidebar navigation

/// Sidebar sections of the main window.
enum AppSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case secrets = "Secrets"
    case runs = "Runs"
    case fileTargets = "File Targets"
    case settings = "Settings"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .dashboard:   return "gauge.with.dots.needle.67percent"
        case .secrets:     return "key.fill"
        case .runs:        return "list.bullet.rectangle"
        case .fileTargets: return "doc.text.fill"
        case .settings:    return "gearshape"
        }
    }
}

struct MainWindowView: View {
    @Environment(AppState.self) private var appState
    @State private var selection: AppSection? = .dashboard

    var body: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: section.systemImage)
                    .tag(section)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
            .listStyle(.sidebar)
        } detail: {
            Group {
                switch selection ?? .dashboard {
                case .dashboard:   DashboardView()
                case .secrets:     SecretsView()
                case .runs:        RunsView()
                case .fileTargets: FileTargetsView()
                case .settings:    SettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(TopSpinTheme.background)
        }
        .navigationTitle("TopSpin")
        .onAppear { consumeRequestedSection() }
        .onChange(of: appState.requestedSection) { _, _ in consumeRequestedSection() }
    }

    private func consumeRequestedSection() {
        guard let requested = appState.requestedSection else { return }
        selection = requested
        appState.requestedSection = nil
    }
}

// MARK: - Menu bar companion

struct MenuBarView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.openWindow) private var openWindow
    @Query(sort: \SecretEntity.createdAt) private var secretEntities: [SecretEntity]

    private var records: [SecretRecord] { secretEntities.map { $0.toRecord() } }
    private var dueCount: Int { appState.scheduler.dueCount }
    private var health: HealthSummary { HealthSummary(records: records, dueCount: dueCount) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: health dot + due count.
            HStack(spacing: 10) {
                Circle()
                    .fill(health.color)
                    .frame(width: 10, height: 10)
                    .shadow(color: health.color.opacity(0.6), radius: 4)
                VStack(alignment: .leading, spacing: 1) {
                    Text("TopSpin")
                        .font(.headline)
                    Text(health.headline)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if appState.rotationService.isRotating || appState.scheduler.isTicking {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            Divider()

            // Rotate due now.
            Button {
                Task {
                    await appState.rotationService.rotateDueNow(triggerScheduled: false)
                    await appState.scheduler.tick()
                }
            } label: {
                Label(dueCount > 0 ? "Rotate \(dueCount) due now" : "Rotate due now",
                      systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(TopSpinTheme.accent)
            .disabled(dueCount == 0)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()

            // Recent runs.
            Text("RECENT RUNS")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
                .tracking(1)
                .padding(.horizontal, 14)
                .padding(.top, 8)
            if appState.rotationService.recentRuns.isEmpty {
                Text("No rotations yet")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
            } else {
                ForEach(appState.rotationService.recentRuns.prefix(5)) { run in
                    MenuBarRunRow(run: run, secretName: secretName(for: run.secretId))
                }
            }

            Divider()
                .padding(.top, 6)

            // Quick links.
            HStack(spacing: 12) {
                Button("Open TopSpin") { openMainWindow(to: .dashboard) }
                Button("Secrets") { openMainWindow(to: .secrets) }
                Button("Settings") { openMainWindow(to: .settings) }
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
            }
            .buttonStyle(.plain)
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .frame(width: 320)
        .task {
            await appState.scheduler.tick()
        }
    }

    private func secretName(for id: UUID) -> String {
        records.first { $0.id == id }?.name ?? "secret"
    }

    private func openMainWindow(to section: AppSection) {
        // Ask the (possibly new) main window to select the section, then
        // bring it forward.
        appState.requestedSection = section
        openWindow(id: "main")
        NSApp.activate()
    }
}

/// One compact run row in the menu bar popover.
private struct MenuBarRunRow: View {
    let run: RotationRun
    let secretName: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: TopSpinTheme.runStatusIcon(run.status))
                .foregroundStyle(TopSpinTheme.runStatusColor(run.status))
                .font(.caption)
            VStack(alignment: .leading, spacing: 1) {
                Text(secretName)
                    .font(.caption)
                    .lineLimit(1)
                Text(run.startedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            FingerprintChip(fingerprint: run.fingerprint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
    }
}

// MARK: - Health summary

/// Aggregate rotation health shared by the Dashboard ring and the menu bar
/// dot.
struct HealthSummary {
    let total: Int
    let healthy: Int
    let due: Int
    let failed: Int
    let partial: Int

    init(records: [SecretRecord], dueCount: Int) {
        total = records.count
        healthy = records.filter { $0.status == .active }.count
        due = dueCount
        failed = records.filter { $0.status == .failed }.count
        partial = records.filter { $0.status == .partial }.count
    }

    /// Overall health color: red on failures, amber on due/partial, else green.
    var color: Color {
        if failed > 0 { return TopSpinTheme.danger }
        if due > 0 || partial > 0 { return TopSpinTheme.warning }
        return TopSpinTheme.accent
    }

    var headline: String {
        if total == 0 { return "No managed secrets" }
        if failed > 0 { return "\(failed) failing · \(due) due" }
        if due > 0 { return "\(due) due for rotation" }
        return "All \(total) secrets healthy"
    }

    /// Fraction healthy (0…1) for the dashboard ring.
    var healthyFraction: Double {
        total == 0 ? 0 : Double(healthy) / Double(total)
    }
}
