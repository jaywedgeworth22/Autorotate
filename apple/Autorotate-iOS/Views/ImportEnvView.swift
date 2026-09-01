//
//  ImportEnvView.swift
//  Autorotate-iOS
//
//  Interactive .env and global-api-keys importer for iOS.
//  Parses secret keys, auto-matches to connector platforms, and batch-imports
//  into the local Keychain and SwiftData stores without persisting plaintext.
//

import SwiftUI
import AutorotateCore

struct ParsedEnvRow: Identifiable {
    let id = UUID()
    var name: String
    var value: String
    var connectorId: String
    var targetInfisical: Bool = true
    var isSelected: Bool = true
}

struct ImportEnvView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model

    @State private var rawText: String = ""
    @State private var isFilePickerPresented = false
    @State private var parsedRows: [ParsedEnvRow] = []
    @State private var isParsed = false
    @State private var isImporting = false
    @State private var importCount = 0
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if !isParsed {
                    inputSection
                } else {
                    reviewSection
                }
            }
            .navigationTitle("Import .env / Keys")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if isParsed {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Import (\(selectedCount))") {
                            Task { await performImport() }
                        }
                        .disabled(selectedCount == 0 || isImporting)
                    }
                }
            }
            .fileImporter(
                isPresented: $isFilePickerPresented,
                allowedContentTypes: [.plainText, .text, .json],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    guard let url = urls.first else { return }
                    if url.startAccessingSecurityScopedResource() {
                        defer { url.stopAccessingSecurityScopedResource() }
                        if let text = try? String(contentsOf: url) {
                            rawText = text
                            parseText(text)
                        }
                    }
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private var inputSection: some View {
        Form {
            Section {
                Text("Paste .env, .env.local, or global-api-keys text to bulk-import secrets into Autorotate.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextEditor(text: $rawText)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 180)
            } header: {
                Text("Secret Content")
            }

            Section {
                Button {
                    isFilePickerPresented = true
                } label: {
                    Label("Choose .env File…", systemImage: "doc.text.magnifyingglass")
                }

                Button {
                    parseText(rawText)
                } label: {
                    Label("Parse & Match Platforms", systemImage: "sparkles")
                        .fontWeight(.semibold)
                }
                .disabled(rawText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
    }

    private var reviewSection: some View {
        List {
            Section {
                HStack {
                    Button(allSelected ? "Deselect All" : "Select All") {
                        let toggle = !allSelected
                        for i in parsedRows.indices {
                            parsedRows[i].isSelected = toggle
                        }
                    }
                    .font(.caption)

                    Spacer()

                    Text("\(selectedCount) of \(parsedRows.count) selected")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Parsed Secrets") {
                ForEach($parsedRows) { $row in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Toggle("", isOn: $row.isSelected)
                                .labelsHidden()

                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name)
                                    .font(.system(.subheadline, design: .monospaced))
                                    .fontWeight(.medium)

                                HStack {
                                    Picker("Connector", selection: $row.connectorId) {
                                        ForEach(ConnectorRegistry.all, id: \.id) { c in
                                            Text(c.displayName).tag(c.id)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                    .font(.caption)

                                    Spacer()

                                    Toggle("Infisical", isOn: $row.targetInfisical)
                                        .font(.caption2)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var selectedCount: Int {
        parsedRows.filter(\.isSelected).count
    }

    private var allSelected: Bool {
        !parsedRows.isEmpty && parsedRows.allSatisfy(\.isSelected)
    }

    private func parseText(_ text: String) {
        let lines = text.components(separatedBy: .newlines)
        var rows: [ParsedEnvRow] = []

        for rawLine in lines {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("#") || line.hasPrefix(";") { continue }

            var cleaned = line
            if cleaned.hasPrefix("export ") {
                cleaned = String(cleaned.dropFirst(7)).trimmingCharacters(in: .whitespaces)
            }

            let parts = cleaned.split(separator: "=", maxSplits: 1).map(String.init)
            if parts.count == 2 {
                let key = parts[0].trimmingCharacters(in: .whitespaces)
                var val = parts[1].trimmingCharacters(in: .whitespaces)
                if (val.hasPrefix("\"") && val.hasSuffix("\"")) || (val.hasPrefix("'") && val.hasSuffix("'")) {
                    val = String(val.dropFirst().dropLast())
                }
                let detected = detectPlatform(key: key, value: val)
                rows.append(ParsedEnvRow(name: key, value: val, connectorId: detected, isSelected: true))
            }
        }

        self.parsedRows = rows
        self.isParsed = !rows.isEmpty
        if rows.isEmpty {
            self.errorMessage = "No valid KEY=value pairs found in input."
        }
    }

    private func detectPlatform(key: String, value: String) -> String {
        let k = key.lowercased()
        let v = value.trimmingCharacters(in: .whitespaces)

        if v.hasPrefix("sk_live_") || v.hasPrefix("rk_live_") || k.contains("stripe") { return "stripe" }
        if v.hasPrefix("sk-proj-") || v.hasPrefix("sk-admin-") || k.contains("openai") { return "openai" }
        if v.hasPrefix("sk-ant-") || k.contains("anthropic") || k.contains("claude") { return "anthropic" }
        if v.hasPrefix("re_") || k.contains("resend") { return "resend" }
        if v.hasPrefix("AKIA") || k.contains("aws") { return "aws.iam" }
        if v.hasPrefix("ghp_") || k.contains("github") { return "github" }
        if v.hasPrefix("xoxb-") || k.contains("slack") { return "slack" }
        if k.contains("cloudflare") { return "cloudflare" }
        if k.contains("twilio") { return "twilio" }
        if k.contains("sendgrid") { return "sendgrid" }
        if k.contains("neon") { return "neon" }
        if k.contains("vercel") { return "vercel" }
        if k.contains("docker") { return "dockerhub" }
        if k.contains("jwt") { return "jwt" }
        if k.contains("database") || k.contains("db_pass") { return "database" }
        if k.contains("webhook") || k.contains("hmac") { return "webhook_hmac" }

        return "generic_secret"
    }

    private func performImport() async {
        isImporting = true
        let selected = parsedRows.filter(\.isSelected)
        let items = selected.map { (name: $0.name, connectorId: $0.connectorId, value: $0.value, targetInfisical: $0.targetInfisical) }

        do {
            let count = try await model.importEnvBatch(items: items)
            self.importCount = count
            dismiss()
        } catch {
            self.errorMessage = error.localizedDescription
            self.isImporting = false
        }
    }
}
