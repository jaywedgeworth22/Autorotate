//
//  Theme.swift
//  Autorotate-macOS
//
//  Shared visual language: dark "security instrument" aesthetic —
//  near-black surfaces, a single green accent (#2EE6A8), and monospaced
//  fingerprints everywhere a secret-adjacent value is displayed.
//

import SwiftUI
import AutorotateCore

/// Autorotate macOS color + typography tokens.
enum AutorotateTheme {

    // MARK: - Colors

    /// Primary accent — Autorotate green (#2EE6A8).
    static let accent = Color(red: 0x2E / 255, green: 0xE6 / 255, blue: 0xA8 / 255)

    /// Deepest background (window chrome).
    static let background = Color(red: 0x08 / 255, green: 0x0B / 255, blue: 0x0A / 255)

    /// Sidebar / secondary surface.
    static let surface = Color(red: 0x0D / 255, green: 0x11 / 255, blue: 0x10 / 255)

    /// Card / row surface.
    static let card = Color(red: 0x12 / 255, green: 0x17 / 255, blue: 0x15 / 255)

    /// Subtle separator / border.
    static let border = Color.white.opacity(0.08)

    /// Primary text.
    static let textPrimary = Color.white.opacity(0.92)

    /// Secondary text.
    static let textSecondary = Color.white.opacity(0.55)

    /// Warning amber (due-soon, partial runs).
    static let warning = Color(red: 0xF5 / 255, green: 0xB8 / 255, blue: 0x4A / 255)

    /// Failure red.
    static let danger = Color(red: 0xF2 / 255, green: 0x5C / 255, blue: 0x5C / 255)

    // MARK: - Fonts

    /// Monospaced font for fingerprints and ids.
    static func mono(_ size: CGFloat = 11, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    // MARK: - Status colors

    static func statusColor(_ status: SecretStatus) -> Color {
        switch status {
        case .active:   return accent
        case .pending:  return textSecondary
        case .partial:  return warning
        case .failed:   return danger
        case .disabled: return textSecondary.opacity(0.5)
        }
    }

    static func runStatusColor(_ status: RotationRunStatus) -> Color {
        switch status {
        case .committed:     return accent
        case .running:       return accent.opacity(0.7)
        case .partial:       return warning
        case .failed:        return danger
        case .skippedLocked: return textSecondary
        }
    }

    static func stepStatusColor(_ status: RotationStepStatus) -> Color {
        switch status {
        case .succeeded: return accent
        case .skipped:   return textSecondary
        case .failed:    return danger
        }
    }

    static func stepStatusIcon(_ status: RotationStepStatus) -> String {
        switch status {
        case .succeeded: return "checkmark.circle.fill"
        case .skipped:   return "minus.circle"
        case .failed:    return "xmark.octagon.fill"
        }
    }

    static func runStatusIcon(_ status: RotationRunStatus) -> String {
        switch status {
        case .committed:     return "checkmark.circle.fill"
        case .running:       return "arrow.triangle.2.circlepath"
        case .partial:       return "exclamationmark.triangle.fill"
        case .failed:        return "xmark.octagon.fill"
        case .skippedLocked: return "lock.fill"
        }
    }

    static func statusIcon(_ status: SecretStatus) -> String {
        switch status {
        case .active:   return "checkmark.shield.fill"
        case .pending:  return "clock"
        case .partial:  return "exclamationmark.triangle.fill"
        case .failed:   return "xmark.octagon.fill"
        case .disabled: return "pause.circle"
        }
    }
}

// MARK: - Reusable components

/// Monospaced fingerprint chip — the only persisted trace of a secret value
/// (`sha256(value)[0:16]`).
struct FingerprintChip: View {
    let fingerprint: String?

    var body: some View {
        Text(fingerprint ?? "––––––––")
            .font(AutorotateTheme.mono(10))
            .foregroundStyle(fingerprint == nil ? AutorotateTheme.textSecondary : AutorotateTheme.accent)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(AutorotateTheme.accent.opacity(fingerprint == nil ? 0.04 : 0.12))
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

/// Small colored dot + label for a secret/run status.
struct StatusBadge: View {
    let color: Color
    let label: String

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.caption)
                .foregroundStyle(AutorotateTheme.textSecondary)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(color.opacity(0.10))
        .clipShape(Capsule())
    }
}

/// Card container used across all views.
struct AutorotateCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AutorotateTheme.card)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(AutorotateTheme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// Section header label.
struct SectionLabel: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(AutorotateTheme.textSecondary)
            .tracking(1.2)
    }
}
