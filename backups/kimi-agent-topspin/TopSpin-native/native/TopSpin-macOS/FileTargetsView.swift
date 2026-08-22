//
//  FileTargetsView.swift
//  TopSpin-macOS
//
//  File target management — the macOS app's home turf:
//    - register files by dragging them in or via NSOpenPanel,
//    - format auto-detection (.env / .json / .yaml / .toml / INI like
//      ~/.aws/credentials),
//    - per-file list of managed keys (which secrets write which key),
//    - per-file "last write" status from run history,
//    - security-scoped bookmarks keep the sandboxed app's access alive
//      across launches (see Bookmarks.swift / entitlements).
//

import SwiftUI
import SwiftData
import TopSpinCore
import UniformTypeIdentifiers

struct FileTargetsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext

    @Query(sort: \FileTargetEntity.createdAt) private var fileEntities: [FileTargetEntity]
    @Query(sort: \SecretEntity.createdAt) private var secretEntities: [SecretEntity]
    @Query(sort: \RunEntity.startedAt, order: .reverse) private var runEntities: [RunEntity]

    @State private var showPicker = false
    @State private var isDropTargeted = false
    @State private var errorMessage: String?

    private var records: [SecretRecord] { secretEntities.map { $0.toRecord() } }
    private var runs: [RotationRun] { runEntities.prefix(50).map { $0.toRun() } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                dropZone
                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(TopSpinTheme.danger)
                }
                targetList
            }
            .padding(24)
        }
        .navigationTitle("File Targets")
        .fileImporter(isPresented: $showPicker,
                      allowedContentTypes: [.item],
                      allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                register(urls: urls)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Managed files")
                    .font(.title2).fontWeight(.semibold)
                Text("Bookmarks retain sandbox access across launches · entitlement: com.apple.security.files.user-selected.read-write")
                    .font(.caption)
                    .foregroundStyle(TopSpinTheme.textSecondary)
            }
            Spacer()
            Button { showPicker = true } label: {
                Label("Add files…", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .tint(TopSpinTheme.accent)
        }
    }

    // MARK: Drop zone

    private var dropZone: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6]))
                .foregroundStyle(isDropTargeted ? TopSpinTheme.accent : TopSpinTheme.border)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(isDropTargeted ? TopSpinTheme.accent.opacity(0.06) : TopSpinTheme.surface)
                )
            VStack(spacing: 8) {
                Image(systemName: "arrow.down.doc")
                    .font(.title2)
                    .foregroundStyle(isDropTargeted ? TopSpinTheme.accent : TopSpinTheme.textSecondary)
                Text("Drop .env, JSON, YAML, TOML or INI files here")
                    .font(.callout)
                    .foregroundStyle(TopSpinTheme.textSecondary)
                Text("Format is detected automatically; contents are never copied into the app.")
                    .font(.caption2)
                    .foregroundStyle(TopSpinTheme.textSecondary.opacity(0.7))
            }
            .padding(.vertical, 28)
        }
        .frame(maxWidth: .infinity)
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers: providers)
            return true
        }
    }

    // MARK: Target list

    private var targetList: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title: "Registered files")
            if fileEntities.isEmpty {
                TopSpinCard {
                    Text("No file targets yet. Add your .env, config.json, ~/.aws/credentials, …")
                        .font(.callout)
                        .foregroundStyle(TopSpinTheme.textSecondary)
                }
            } else {
                ForEach(fileEntities) { entity in
                    FileTargetRow(entity: entity,
                                  keys: FileTargetInspector.managedKeys(forPath: entity.displayPath,
                                                                        in: records),
                                  lastWrite: FileTargetInspector.lastWrite(forPath: entity.displayPath,
                                                                           records: records,
                                                                           runs: runs)
                                    ?? entityPersistedWrite(entity)) {
                        modelContext.delete(entity)
                        try? modelContext.save()
                    }
                }
            }
        }
    }

    /// Falls back to the entity's persisted last-write info when no recent
    /// run step matches (e.g. the run history was trimmed).
    private func entityPersistedWrite(_ entity: FileTargetEntity)
        -> (date: Date, status: FileTargetWriteStatus, detail: String)? {
        guard let date = entity.lastWriteAt, let status = entity.lastWriteStatus else { return nil }
        return (date, status, entity.lastWriteDetail ?? status.rawValue)
    }

    // MARK: Registration

    private func handleDrop(providers: [NSItemProvider]) {
        for provider in providers {
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                guard let url else { return }
                DispatchQueue.main.async {
                    register(urls: [url])
                }
            }
        }
    }

    private func register(urls: [URL]) {
        errorMessage = nil
        for url in urls {
            // Access the user-selected URL (sandbox), then persist a
            // security-scoped bookmark so future launches keep the grant.
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            do {
                let bookmark = try BookmarkStore().createBookmark(for: url)
                let path = url.path
                if fileEntities.contains(where: { $0.displayPath == path }) { continue }
                let format = FileFormatDetector.detect(url: url)
                modelContext.insert(FileTargetEntity(bookmarkData: bookmark,
                                                     displayPath: path,
                                                     format: format))
            } catch {
                errorMessage = String(describing: error)
            }
        }
        try? modelContext.save()
    }
}

// MARK: - File target row

private struct FileTargetRow: View {
    let entity: FileTargetEntity
    let keys: [ManagedKeyInfo]
    let lastWrite: (date: Date, status: FileTargetWriteStatus, detail: String)?
    let onDelete: () -> Void

    @State private var isExpanded = false

    var body: some View {
        TopSpinCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "doc.text.fill")
                        .foregroundStyle(TopSpinTheme.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entity.displayPath)
                            .font(TopSpinTheme.mono(11))
                            .foregroundStyle(TopSpinTheme.textPrimary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .textSelection(.enabled)
                        HStack(spacing: 8) {
                            formatBadge
                            Text("\(keys.count) managed key\(keys.count == 1 ? "" : "s")")
                                .font(.caption2)
                                .foregroundStyle(TopSpinTheme.textSecondary)
                            lastWriteBadge
                        }
                    }
                    Spacer()
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { isExpanded.toggle() }
                    } label: {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(TopSpinTheme.textSecondary)
                    Button(role: .destructive, action: onDelete) {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(TopSpinTheme.danger)
                    .help("Remove the bookmark (the file itself is untouched)")
                }

                if isExpanded {
                    if keys.isEmpty {
                        Text("No secret binds a key in this file yet — add a file binding in the Secrets section.")
                            .font(.caption)
                            .foregroundStyle(TopSpinTheme.textSecondary)
                    } else {
                        ForEach(keys) { key in
                            HStack(spacing: 8) {
                                Image(systemName: key.enabled ? "key.fill" : "key.slash")
                                    .font(.caption2)
                                    .foregroundStyle(key.enabled ? TopSpinTheme.accent : TopSpinTheme.textSecondary)
                                Text(key.secretName)
                                    .font(.caption).fontWeight(.medium)
                                Image(systemName: "arrow.right")
                                    .font(.caption2)
                                    .foregroundStyle(TopSpinTheme.textSecondary)
                                Text(key.section.map { "[\($0)] \(key.keyPath)" } ?? key.keyPath)
                                    .font(TopSpinTheme.mono(11))
                                    .foregroundStyle(TopSpinTheme.textSecondary)
                                Spacer()
                                if !key.required {
                                    Text("optional")
                                        .font(.caption2)
                                        .foregroundStyle(TopSpinTheme.textSecondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
        }
    }

    private var formatBadge: some View {
        Text(FileFormatDetector.label(entity.format))
            .font(TopSpinTheme.mono(9, weight: .bold))
            .foregroundStyle(TopSpinTheme.accent)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(TopSpinTheme.accent.opacity(0.5)))
    }

    @ViewBuilder
    private var lastWriteBadge: some View {
        if let lastWrite {
            HStack(spacing: 4) {
                Circle()
                    .fill(lastWrite.status == .succeeded ? TopSpinTheme.accent : TopSpinTheme.danger)
                    .frame(width: 6, height: 6)
                Text("last write \(lastWrite.date, style: .relative) ago")
                    .font(.caption2)
                    .foregroundStyle(TopSpinTheme.textSecondary)
            }
        } else {
            Text("never written")
                .font(.caption2)
                .foregroundStyle(TopSpinTheme.textSecondary.opacity(0.7))
        }
    }
}
