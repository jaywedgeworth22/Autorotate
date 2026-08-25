//
//  Components.swift
//  Autorotate-iOS
//
//  Reusable UI atoms: status dots, fingerprint chips, badges, step rows,
//  section headers, empty states.
//

import SwiftUI
import UIKit
import AutorotateCore

// MARK: - Status dot

/// Small colored dot reflecting a secret/run status.
struct StatusDot: View {
    let color: Color
    var size: CGFloat = 8

    init(color: Color, size: CGFloat = 8) {
        self.color = color
        self.size = size
    }

    init(status: SecretStatus, size: CGFloat = 8) {
        self.init(color: Theme.color(for: status), size: size)
    }

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .shadow(color: color.opacity(0.6), radius: 3)
    }
}

// MARK: - Fingerprint chip

/// Monospaced `sha256[0:8]` chip. Long-press copies to the pasteboard.
struct FingerprintChip: View {
    let fingerprint: String?

    var body: some View {
        Group {
            if let fingerprint, !fingerprint.isEmpty {
                Text("sha256:\(fingerprint)")
                    .font(Theme.mono(.caption2))
                    .foregroundStyle(Theme.accent)
            } else {
                Text("no fingerprint")
                    .font(Theme.mono(.caption2))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Theme.surfaceRaised)
        .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
        .clipShape(Capsule())
        .contextMenu {
            if let fingerprint {
                Button {
                    UIPasteboard.general.string = fingerprint
                } label: {
                    Label("Copy fingerprint", systemImage: "doc.on.doc")
                }
            }
        }
    }
}

// MARK: - Run status badge

struct RunStatusBadge: View {
    let status: RotationRunStatus

    var body: some View {
        Text(status.displayName.uppercased())
            .font(Theme.sectionLabel())
            .foregroundStyle(Theme.color(for: status))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Theme.color(for: status).opacity(0.12))
            .overlay(Capsule().stroke(Theme.color(for: status).opacity(0.4), lineWidth: 1))
            .clipShape(Capsule())
    }
}

// MARK: - Capability badge

struct CapabilityBadge: View {
    let capability: ConnectorCapability

    private var label: String {
        switch capability {
        case .programmatic: return "PROGRAMMATIC"
        case .partial:      return "PARTIAL"
        case .updateOnly:   return "UPDATE ONLY"
        }
    }

    private var color: Color {
        switch capability {
        case .programmatic: return Theme.accent
        case .partial:      return Theme.warning
        case .updateOnly:   return Theme.textSecondary
        }
    }

    var body: some View {
        Label(label, systemImage: Theme.icon(for: capability))
            .font(Theme.sectionLabel())
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.10))
            .overlay(Capsule().stroke(color.opacity(0.35), lineWidth: 1))
            .clipShape(Capsule())
            .labelStyle(.titleAndIcon)
    }
}

// MARK: - Pipeline step row

/// One row of the LOCK→ROTATE→PUSH→VERIFY→COMMIT→AUDIT timeline.
struct StepResultRow: View {
    let result: RotationStepResult

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: Theme.icon(for: result.status))
                .foregroundStyle(Theme.color(for: result.status))
                .font(.callout)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(result.step.displayName)
                        .font(Theme.mono(.caption))
                        .fontWeight(.semibold)
                        .foregroundStyle(Theme.text)
                    if result.targetId != nil {
                        Text("target")
                            .font(Theme.mono(.caption2))
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                    Text(result.finishedAt.timeIntervalSince(result.startedAt), format: .number.precision(.fractionLength(2)))
                        .font(Theme.mono(.caption2))
                        .foregroundStyle(Theme.textSecondary)
                    + Text("s")
                        .font(Theme.mono(.caption2))
                        .foregroundStyle(Theme.textSecondary)
                }
                if let detail = result.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Section header

struct InstrumentSectionHeader: View {
    let title: String
    var systemImage: String? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.caption2)
            }
            Text(title.uppercased())
                .font(Theme.sectionLabel())
        }
        .foregroundStyle(Theme.textSecondary)
        .tracking(1.2)
    }
}

// MARK: - Empty state

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(Theme.textSecondary.opacity(0.6))
            Text(title)
                .font(.headline)
                .foregroundStyle(Theme.textSecondary)
            if let message {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}

// MARK: - Stat tile (dashboard)

struct StatTile: View {
    let title: String
    let value: String
    var color: Color = Theme.accent
    var systemImage: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage).font(.caption2)
                }
                Text(title.uppercased())
                    .font(Theme.sectionLabel())
            }
            .foregroundStyle(Theme.textSecondary)
            Text(value)
                .font(.system(.title, design: .monospaced, weight: .bold))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .instrumentCard()
    }
}
