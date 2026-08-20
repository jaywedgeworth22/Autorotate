//
//  NotificationManager.swift
//  TopSpin-iOS
//
//  Local notifications via UNUserNotificationCenter. TopSpin notifies on
//  rotation FAILURE (and partial runs) so operators notice a stuck pipeline
//  even when rotations happened in a background refresh.
//
//  Permission is requested politely: once, the first time a notification
//  would be sent (or when the user toggles notifications on in Settings) —
//  never at first launch before the user has context.
//

import Foundation
import UserNotifications
import TopSpinCore

enum NotificationManager {

    /// Requests authorization once, only when the user has notifications
    /// enabled and we haven't asked before. Returns whether alerts are now
    /// authorized.
    @discardableResult
    static func requestAuthorizationIfNeeded(settings: SettingsStorage) async -> Bool {
        guard settings.notificationsEnabled else { return false }
        let center = UNUserNotificationCenter.current()
        let current = await center.notificationSettings()
        switch current.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined:
            guard !settings.notificationPermissionAsked else { return false }
            settings.notificationPermissionAsked = true
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            return granted
        case .denied:
            return false
        @unknown default:
            return false
        }
    }

    /// Posts a local notification for a failed or partially-committed
    /// rotation run. Detail strings from the engine are already sanitized
    /// (fingerprints only, never values).
    static func notifyRotationIssue(secretName: String,
                                    status: RotationRunStatus,
                                    detail: String?,
                                    settings: SettingsStorage) async {
        guard settings.notificationsEnabled,
              status == .failed || status == .partial else { return }
        guard await requestAuthorizationIfNeeded(settings: settings) else { return }

        let content = UNMutableNotificationContent()
        content.title = status == .failed
            ? "Rotation failed: \(secretName)"
            : "Rotation partially applied: \(secretName)"
        content.body = detail.map { String($0.prefix(180)) }
            ?? "Open TopSpin to inspect the run and retry."
        content.sound = .default
        content.threadIdentifier = "topspin.rotations"

        let request = UNNotificationRequest(
            identifier: "topspin.rotation.\(UUID().uuidString)",
            content: content,
            trigger: nil) // deliver immediately
        try? await UNUserNotificationCenter.current().add(request)
    }
}
