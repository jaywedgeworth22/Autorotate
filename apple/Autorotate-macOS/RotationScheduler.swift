//
//  RotationScheduler.swift
//  Autorotate-macOS
//
//  Foreground scheduler: while the app runs, a repeating `Timer` drives
//  `RotationEngine.rotateDueSecrets()`. The menu bar icon and Dashboard
//  health read their state from here.
//
//  Unlike iOS (BGTaskScheduler), a sandboxed macOS app can simply keep a
//  timer alive; the MenuBarExtra scene keeps the process resident even when
//  no window is open. Secrets use
//  `kSecAttrAccessibleAfterFirstUnlock` (KeychainManager) so scheduled runs
//  can read admin credentials without user interaction.
//

import Foundation
import Observation
import AutorotateCore

/// Periodic driver for due-secret rotation.
@MainActor
@Observable
final class RotationScheduler {

    /// Number of secrets currently due (auto-rotate enabled, interval elapsed).
    private(set) var dueCount = 0
    /// When the scheduler last ticked.
    private(set) var lastTickAt: Date?
    /// Whether a scheduled batch is in flight.
    private(set) var isTicking = false
    /// Runs produced by the most recent tick (empty when nothing was due).
    private(set) var lastTickRuns: [RotationRun] = []

    private let service: RotationService
    private var timer: Timer?
    private var intervalMinutes: Int = 15

    init(service: RotationService) {
        self.service = service
    }

    /// Starts (or restarts) the timer with the given interval.
    func start(intervalMinutes: Int = 15) {
        self.intervalMinutes = max(1, intervalMinutes)
        timer?.invalidate()
        timer = Timer.scheduledTimer(
            withTimeInterval: TimeInterval(self.intervalMinutes) * 60,
            repeats: true
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.tick()
            }
        }
        // Fire an immediate catch-up tick on launch.
        Task { @MainActor in await tick() }
    }

    /// Applies a new interval from Settings (restarts the timer).
    func applyInterval(minutes: Int) {
        guard minutes != intervalMinutes || timer == nil else { return }
        start(intervalMinutes: minutes)
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// One scheduler pass: count due secrets, rotate them, publish state.
    func tick() async {
        guard !isTicking else { return }
        isTicking = true
        defer { isTicking = false }
        lastTickAt = Date()
        do {
            let due = try await service.engine.dueSecrets()
            dueCount = due.count
            guard !due.isEmpty else {
                lastTickRuns = []
                return
            }
            lastTickRuns = await service.rotateDueNow(triggerScheduled: true)
            // Re-count after the batch (successful runs are no longer due).
            dueCount = (try? await service.engine.dueSecrets().count) ?? 0
        } catch {
            dueCount = 0
        }
    }
}
