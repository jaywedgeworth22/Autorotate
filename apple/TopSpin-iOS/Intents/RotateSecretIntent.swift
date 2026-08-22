//
//  RotateSecretIntent.swift
//  TopSpin-iOS
//
//  App Intents for Siri Shortcuts, Action Button, and Control Center rotation automation.
//

import AppIntents
import Foundation
import SwiftData
import TopSpinCore

struct RotateDueSecretsIntent: AppIntent {
    static let title: LocalizedStringResource = "Rotate Due Secrets"
    static let description = IntentDescription("Rotates all secrets currently due for scheduled rotation in Autorotate.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        // AppModel rotation invocation
        let container = try ModelContainer(for: SDSecretRecord.self, SDRotationRun.self, SDAuditEntry.self, SDConnectorConfig.self)
        let model = AppModel(container: container)
        await model.rotateDueSecretsNow()
        return .result(dialog: "Autorotate completed rotating all due secrets.")
    }
}

