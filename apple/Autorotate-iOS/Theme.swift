//
//  Theme.swift
//  TopSpin-iOS
//
//  Design system — dark security-instrument aesthetic mirroring the web app:
//  near-black backgrounds, a single green accent (#2EE6A8), monospaced
//  fingerprints, thin borders, status-colored dots.
//

import SwiftUI
import TopSpinCore

enum Theme {

    // MARK: Colors

    /// Near-black app background.
    static let background = Color(hex: 0x07090D)
    /// Raised surface (cards, sections).
    static let surface = Color(hex: 0x0E141B)
    /// Secondary surface (chips, wells).
    static let surfaceRaised = Color(hex: 0x141C25)
    /// Hairline borders.
    static let border = Color(hex: 0x1E2833)
    /// Primary accent — TopSpin green.
    static let accent = Color(hex: 0x2EE6A8)
    /// Dimmed accent for fills.
    static let accentDim = Color(hex: 0x2EE6A8).opacity(0.14)
    /// Primary text.
    static let text = Color(hex: 0xE6EDF3)
    /// Secondary text.
    static let textSecondary = Color(hex: 0x8B98A5)
    /// Warning (partial runs, expiring soon).
    static let warning = Color(hex: 0xF5B942)
    /// Danger (failed runs).
    static let danger = Color(hex: 0xF25555)
    /// Neutral (pending / skipped / disabled).
    static let neutral = Color(hex: 0x5A6672)

    // MARK: Fonts

    /// Monospaced font for fingerprints, keychain services, value refs.
    static func mono(_ style: Font.TextStyle = .caption) -> Font {
        .system(style, design: .monospaced)
    }

    /// Small uppercase section label.
    static func sectionLabel(_ style: Font.TextStyle = .caption2) -> Font {
        .system(style, design: .default, weight: .semibold)
    }

    // MARK: Status mapping

    static func color(for status: SecretStatus) -> Color {
        switch status {
        case .active:   return accent
        case .pending:  return warning
        case .partial:  return warning
        case .failed:   return danger
        case .disabled: return neutral
        }
    }

    static func color(for status: RotationRunStatus) -> Color {
        switch status {
        case .committed:      return accent
        case .running:        return warning
        case .partial:        return warning
        case .failed:         return danger
        case .skippedLocked:  return neutral
        }
    }

    static func color(for status: RotationStepStatus) -> Color {
        switch status {
        case .succeeded: return accent
        case .skipped:   return neutral
        case .failed:    return danger
        }
    }

    static func icon(for status: RotationStepStatus) -> String {
        switch status {
        case .succeeded: return "checkmark.circle.fill"
        case .skipped:   return "minus.circle.fill"
        case .failed:    return "xmark.octagon.fill"
        }
    }

    static func icon(for kind: TargetKind) -> String {
        switch kind {
        case .infisical: return "cloud.fill"
        case .file:      return "doc.fill"
        case .webhook:   return "antenna.radiowaves.left.and.right"
        case .keychain:  return "key.fill"
        }
    }

    static func icon(for capability: ConnectorCapability) -> String {
        switch capability {
        case .programmatic: return "bolt.fill"
        case .partial:      return "bolt.trianglebadge.exclamationmark.fill"
        case .updateOnly:   return "hand.raised.fill"
        }
    }
}

// MARK: - Color hex initializer

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: opacity)
    }
}

// MARK: - View helpers

extension View {
    /// Standard TopSpin card: raised surface + hairline border.
    func instrumentCard(cornerRadius: CGFloat = 12) -> some View {
        self
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }

    /// Applies the app-wide dark background to a screen.
    func topSpinScreenBackground() -> some View {
        self.background(Theme.background.ignoresSafeArea())
    }
}

// MARK: - SecretRecord display helpers

extension SecretRecord {
    /// Display name of the connector backing this record.
    var connectorDisplayName: String {
        ConnectorRegistry.descriptor(for: connectorId)?.displayName ?? connectorId
    }

    /// Capability of the backing connector (nil for unknown/custom ids).
    var connectorCapability: ConnectorCapability? {
        ConnectorRegistry.capability(of: connectorId)
    }

    /// Next due date, when the policy can produce one.
    func nextDueDate() -> Date? {
        guard let lastRotatedAt else { return policy.autoRotate ? Date.distantPast : nil }
        return policy.nextDue(after: lastRotatedAt)
    }

    /// "Due soon" = auto-rotating and due within the given horizon.
    func isDueSoon(within horizon: TimeInterval = 72 * 3600, now: Date = Date()) -> Bool {
        guard policy.autoRotate, status != .disabled else { return false }
        guard let next = nextDueDate() else { return false }
        return next <= now.addingTimeInterval(horizon)
    }
}

extension RotationRunStatus {
    var displayName: String {
        switch self {
        case .running:        return "Running"
        case .committed:      return "Committed"
        case .partial:        return "Partial"
        case .failed:         return "Failed"
        case .skippedLocked:  return "Skipped (locked)"
        }
    }
}

extension RotationStep {
    var displayName: String { rawValue.uppercased() }
}
