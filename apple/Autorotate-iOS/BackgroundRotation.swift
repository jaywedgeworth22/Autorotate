//
//  BackgroundRotation.swift
//  Autorotate-iOS
//
//  BGAppRefreshTask-based background rotation driver (architecture.md §2 —
//  the scheduler that calls `RotationEngine.rotateDueSecrets()`).
//
//  - Task identifier `com.autorotate.refresh` is declared in Info.plist
//    (BGTaskSchedulerPermittedIdentifiers) and requires the "fetch"
//    background mode.
//  - Registration happens in `AutorotateApp.init` (before the app finishes
//    launching, as BGTaskScheduler requires).
//  - A refresh is scheduled every time the app moves to the background.
//

import BackgroundTasks
import Foundation

enum BackgroundRotation {

    /// Registered BGAppRefreshTask identifier (must match Info.plist).
    static let taskIdentifier = "codes.autorotate.refresh"


    /// Minimum spacing between background refresh passes. The system may
    /// deliver later (or not at all) based on usage patterns and battery.
    static let earliestInterval: TimeInterval = 6 * 3600 // 6 hours

    /// Registers the refresh task handler. Must be called during app launch.
    static func register(handler: @escaping @Sendable (BGAppRefreshTask) -> Void) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier,
                                        using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handler(refreshTask)
        }
    }

    /// Schedules the next app refresh. Call when the app backgrounds.
    static func scheduleAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: earliestInterval)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// Removes pending refresh requests (e.g. when the user disables
    /// auto-rotation everywhere — kept for future settings use).
    static func cancelPending() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
    }
}
