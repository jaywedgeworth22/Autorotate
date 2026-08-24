//
//  FileTargets.swift
//  TopSpinCore
//
//  File target engine (architecture.md §2 step 3): updates a single key
//  inside a local secret file and rewrites the file atomically
//  (write tmp + rename).
//
//  Supported formats: .env (dotenv), JSON (nested dot key path), YAML,
//  TOML, INI (`~/.aws/credentials` style with [profile] sections).
//
//  Parser philosophy: Foundation only, no external deps.
//  - dotenv / INI: small exact parsers.
//  - JSON: JSONSerialization (full fidelity for JSON-compatible files).
//  - YAML / TOML: careful LINE-BASED updates. They correctly handle flat
//    string keys (TOML additionally inside one `[table]`) and preserve all
//    other lines byte-for-byte. They intentionally do NOT implement the
//    full YAML/TOML specs: multi-line values, anchors, inline tables,
//    arrays-of-tables etc. are out of scope. When a key cannot be matched
//    unambiguously, the update FAILS rather than corrupting the file.
//

import Foundation
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

/// Errors thrown by ``FileTargetEngine``.
public enum FileTargetError: Error, Sendable, CustomStringConvertible {
    /// The file does not exist at the configured path.
    case fileNotFound(String)
    /// The file could not be read/decoded as UTF-8.
    case unreadable(String)
    /// The key path is ambiguous or uses syntax the minimal parser does not
    /// support (see format-specific limits in the file header).
    case unsupportedKeyPath(String)
    /// The update could not be applied safely.
    case updateFailed(String)
    /// The atomic rename failed.
    case writeFailed(String)

    public var description: String {
        switch self {
        case .fileNotFound(let p):    return "File not found: \(p)"
        case .unreadable(let p):      return "File unreadable (not UTF-8?): \(p)"
        case .unsupportedKeyPath(let k): return "Unsupported key path: \(k)"
        case .updateFailed(let m):    return "File update failed: \(m)"
        case .writeFailed(let m):     return "Atomic write failed: \(m)"
        }
    }
}

/// Updates keys inside local secret files with atomic writes.
public struct FileTargetEngine: Sendable {

    private let fileManager: FileManager

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    // MARK: - Public API

    /// Sets `keyPath` (and `section` for INI/TOML) to `value` in the file at
    /// `config.path`, then atomically replaces the file.
    ///
    /// Missing keys are appended (dotenv) or created (JSON/INI/TOML/YAML
    /// flat keys). The file is created when absent for dotenv/INI; other
    /// formats require an existing file so structure is not invented.
    public func setValue(_ value: String, in config: FileTargetConfig) throws {
        let path = (config.path as NSString).expandingTildeInPath
        let original = try readFile(path: path, allowMissing: config.format == .dotenv || config.format == .ini)
        let updated: String
        switch config.format {
        case .dotenv:
            updated = Self.dotenvSet(key: config.keyPath, value: value, in: original ?? "")
        case .json:
            guard let original else { throw FileTargetError.fileNotFound(path) }
            updated = try Self.jsonSet(keyPath: config.keyPath, value: value, in: original)
        case .yaml:
            guard let original else { throw FileTargetError.fileNotFound(path) }
            updated = try Self.yamlSet(key: config.keyPath, value: value, in: original)
        case .toml:
            guard let original else { throw FileTargetError.fileNotFound(path) }
            updated = try Self.tomlSet(key: config.keyPath, value: value,
                                       table: config.section, in: original)
        case .ini:
            updated = try Self.iniSet(key: config.keyPath, value: value,
                                      section: config.section ?? "default", in: original ?? "")
        }
        try atomicWrite(contents: updated, to: path)
    }

    /// Reads back the current value of the configured key — used by the
    /// VERIFY pipeline step. Returns `nil` when the key is absent.
    public func getValue(from config: FileTargetConfig) throws -> String? {
        let path = (config.path as NSString).expandingTildeInPath
        guard let text = try readFile(path: path, allowMissing: true) else { return nil }
        switch config.format {
        case .dotenv:
            return Self.dotenvGet(key: config.keyPath, in: text)
        case .json:
            return Self.jsonGet(keyPath: config.keyPath, in: text)
        case .yaml:
            return Self.yamlGet(key: config.keyPath, in: text)
        case .toml:
            return Self.tomlGet(key: config.keyPath, table: config.section, in: text)
        case .ini:
            return Self.iniGet(key: config.keyPath, section: config.section ?? "default", in: text)
        }
    }

    // MARK: - File IO

    private func readFile(path: String, allowMissing: Bool) throws -> String? {
        guard fileManager.fileExists(atPath: path) else {
            if allowMissing { return nil }
            throw FileTargetError.fileNotFound(path)
        }
        guard let data = fileManager.contents(atPath: path),
              let text = String(data: data, encoding: .utf8) else {
            throw FileTargetError.unreadable(path)
        }
        return text
    }

    /// Atomically replaces the file at `path`: writes a temp file in the
    /// same directory, then renames over the original (POSIX rename is
    /// atomic on the same volume). Original file permissions are preserved.
    func atomicWrite(contents: String, to path: String) throws {
        let url = URL(fileURLWithPath: path)
        let directory = url.deletingLastPathComponent()
        let tempURL = directory.appendingPathComponent(".\(url.lastPathComponent).topspin-\(UUID().uuidString).tmp")
        do {
            // Preserve existing permissions when the file already exists.
            var attributes: [FileAttributeKey: Any] = [:]
            if let existing = try? fileManager.attributesOfItem(atPath: path),
               let permissions = existing[.posixPermissions] as? NSNumber {
                attributes[.posixPermissions] = permissions
            }
            try contents.write(to: tempURL, atomically: false, encoding: .utf8)
            if !attributes.isEmpty {
                try? fileManager.setAttributes(attributes, ofItemAtPath: tempURL.path)
            }
            // POSIX rename(2): atomically replaces the destination on the
            // same volume — the temp file and target always share a parent
            // directory, so this never crosses filesystems.
            guard rename(tempURL.path, path) == 0 else {
                throw FileTargetError.writeFailed(
                    "rename failed for \(path): errno \(errno)")
            }
        } catch {
            try? fileManager.removeItem(at: tempURL)
            throw FileTargetError.writeFailed("\(path): \(error.localizedDescription)")
        }
    }

    // MARK: - dotenv

    /// Updates or appends `KEY=value` in dotenv text. Comments (`#`) and
    /// blank lines are preserved. Values are written bare (no quoting) —
    /// generated secrets use a shell-safe alphabet.
    static func dotenvSet(key: String, value: String, in text: String) -> String {
        var lines = text.components(separatedBy: "\n")
        var replaced = false
        for index in lines.indices {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { continue }
            let body = trimmed.hasPrefix("export ") ? String(trimmed.dropFirst(7)) : trimmed
            guard let equals = body.firstIndex(of: "=") else { continue }
            let existingKey = body[..<equals].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            let hasExport = trimmed.hasPrefix("export ")
            lines[index] = "\(hasExport ? "export " : "")\(key)=\(value)"
            replaced = true
        }
        if !replaced {
            if lines.last?.isEmpty == false { lines.append("") }
            lines.append("\(key)=\(value)")
        }
        return lines.joined(separator: "\n")
    }

    static func dotenvGet(key: String, in text: String) -> String? {
        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { continue }
            let body = trimmed.hasPrefix("export ") ? String(trimmed.dropFirst(7)) : trimmed
            guard let equals = body.firstIndex(of: "=") else { continue }
            let existingKey = body[..<equals].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            var value = String(body[body.index(after: equals)...]).trimmingCharacters(in: .whitespaces)
            // Strip matching quotes.
            if value.count >= 2,
               (value.hasPrefix("\"") && value.hasSuffix("\""))
                || (value.hasPrefix("'") && value.hasSuffix("'")) {
                value = String(value.dropFirst().dropLast())
            }
            return value
        }
        return nil
    }

    // MARK: - JSON

    /// Sets a nested key path (`a.b.c`) via JSONSerialization. Creates
    /// intermediate dictionaries as needed. Arrays are not traversed (a
    /// numeric component throws ``FileTargetError/unsupportedKeyPath(_:)``).
    static func jsonSet(keyPath: String, value: String, in text: String) throws -> String {
        let components = keyPath.split(separator: ".").map(String.init)
        guard !components.isEmpty else { throw FileTargetError.unsupportedKeyPath(keyPath) }
        guard let data = text.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data),
              var root = parsed as? [String: Any] else {
            throw FileTargetError.updateFailed("JSON root must be an object.")
        }
        Self.jsonSetRecursive(components: components[...], value: value, into: &root)
        guard let out = try? JSONSerialization.data(
                withJSONObject: root,
                options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]),
              let outText = String(data: out, encoding: .utf8) else {
            throw FileTargetError.updateFailed("JSON serialization failed after update.")
        }
        return outText + "\n"
    }

    private static func jsonSetRecursive(components: ArraySlice<String>,
                                         value: String,
                                         into dict: inout [String: Any]) {
        guard let head = components.first else { return }
        if components.count == 1 {
            dict[head] = value
            return
        }
        var child = dict[head] as? [String: Any] ?? [:]
        jsonSetRecursive(components: components.dropFirst(), value: value, into: &child)
        dict[head] = child
    }

    static func jsonGet(keyPath: String, in text: String) -> String? {
        guard let data = text.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) else { return nil }
        var current: Any = parsed
        for component in keyPath.split(separator: ".").map(String.init) {
            guard let dict = current as? [String: Any], let next = dict[component] else { return nil }
            current = next
        }
        return current as? String
    }

    // MARK: - INI (~/.aws/credentials)

    /// Updates or appends `key = value` inside `[section]`. Creates the
    /// section when missing. Comments (`#`, `;`) and other sections are
    /// preserved byte-for-byte.
    static func iniSet(key: String, value: String, section: String, in text: String) throws -> String {
        var lines = text.components(separatedBy: "\n")
        var currentSection: String?
        var sectionStart: Int?
        var sectionEnd: Int?
        var replaced = false

        for (index, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("["), trimmed.hasSuffix("]") {
                if currentSection == section, sectionEnd == nil {
                    sectionEnd = index // section ends before this header
                }
                currentSection = String(trimmed.dropFirst().dropLast())
                    .trimmingCharacters(in: .whitespaces)
                if currentSection == section {
                    sectionStart = index
                    sectionEnd = nil
                }
                continue
            }
            guard currentSection == section,
                  !trimmed.isEmpty,
                  !trimmed.hasPrefix("#"), !trimmed.hasPrefix(";"),
                  let equals = trimmed.firstIndex(of: "=") else { continue }
            let existingKey = trimmed[..<equals].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            lines[index] = "\(key) = \(value)"
            replaced = true
        }

        if !replaced {
            if let start = sectionStart {
                let insertion = sectionEnd ?? lines.count
                lines.insert("\(key) = \(value)", at: insertion)
            } else {
                if lines.last?.isEmpty == false { lines.append("") }
                lines.append("[\(section)]")
                lines.append("\(key) = \(value)")
            }
        }
        return lines.joined(separator: "\n")
    }

    static func iniGet(key: String, section: String, in text: String) -> String? {
        var currentSection: String?
        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("["), trimmed.hasSuffix("]") {
                currentSection = String(trimmed.dropFirst().dropLast())
                    .trimmingCharacters(in: .whitespaces)
                continue
            }
            guard currentSection == section,
                  !trimmed.hasPrefix("#"), !trimmed.hasPrefix(";"),
                  let equals = trimmed.firstIndex(of: "=") else { continue }
            let existingKey = trimmed[..<equals].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            return trimmed[trimmed.index(after: equals)...].trimmingCharacters(in: .whitespaces)
        }
        return nil
    }

    // MARK: - YAML (line-based, flat keys)

    /// Updates a flat top-level `key: value` pair.
    ///
    /// LIMITS: only top-level (zero-indentation) keys with scalar values on
    /// the same line are supported. Nested maps, lists, multi-line scalars
    /// (`|`, `>`), anchors and documents markers cause an
    /// ``FileTargetError/unsupportedKeyPath(_:)`` error rather than a risky
    /// rewrite. Quote style of the existing value is preserved.
    static func yamlSet(key: String, value: String, in text: String) throws -> String {
        guard !key.contains(".") else {
            throw FileTargetError.unsupportedKeyPath(
                "\(key) — YAML engine supports flat top-level keys only.")
        }
        var lines = text.components(separatedBy: "\n")
        var matchCount = 0
        for index in lines.indices {
            let line = lines[index]
            guard !line.hasPrefix(" "), !line.hasPrefix("\t"),
                  !line.hasPrefix("#"), !line.hasPrefix("-"),
                  let colon = line.firstIndex(of: ":") else { continue }
            let existingKey = line[..<colon].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            matchCount += 1
            let rest = line[line.index(after: colon)...]
            let trimmedRest = rest.trimmingCharacters(in: .whitespaces)
            let quote: String
            if trimmedRest.hasPrefix("\"") { quote = "\"" }
            else if trimmedRest.hasPrefix("'") { quote = "'" }
            else { quote = "" }
            lines[index] = "\(key): \(quote)\(value)\(quote)"
        }
        if matchCount == 0 {
            if lines.last?.isEmpty == false { lines.append("") }
            lines.append("\(key): \(value)")
        } else if matchCount > 1 {
            throw FileTargetError.updateFailed(
                "YAML key '\(key)' matched \(matchCount) lines — refusing ambiguous update.")
        }
        return lines.joined(separator: "\n")
    }

    static func yamlGet(key: String, in text: String) -> String? {
        for line in text.components(separatedBy: "\n") {
            guard !line.hasPrefix(" "), !line.hasPrefix("\t"),
                  !line.hasPrefix("#"),
                  let colon = line.firstIndex(of: ":") else { continue }
            let existingKey = line[..<colon].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            var value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            if value.count >= 2,
               (value.hasPrefix("\"") && value.hasSuffix("\""))
                || (value.hasPrefix("'") && value.hasSuffix("'")) {
                value = String(value.dropFirst().dropLast())
            }
            return value
        }
        return nil
    }

    // MARK: - TOML (line-based, flat keys, one [table])

    /// Updates `key = "value"` at the top level or inside `[table]`.
    ///
    /// LIMITS: flat keys only; values are always written as basic strings.
    /// Arrays, inline tables, dotted keys and arrays-of-tables are out of
    /// scope. The existing line's trailing comment (`# ...`) is preserved.
    static func tomlSet(key: String, value: String, table: String?, in text: String) throws -> String {
        var lines = text.components(separatedBy: "\n")
        var currentTable: String?
        var targetTableStart: Int?
        var targetTableEnd: Int?
        var matchCount = 0
        var matchIndex: Int?

        for (index, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("[") && trimmed.hasSuffix("]") && !trimmed.hasPrefix("[[") {
                if currentTable == table, targetTableEnd == nil {
                    targetTableEnd = index
                }
                currentTable = String(trimmed.dropFirst().dropLast())
                    .trimmingCharacters(in: .whitespaces)
                if currentTable == table {
                    targetTableStart = index
                    targetTableEnd = nil
                }
                continue
            }
            guard currentTable == table,
                  !trimmed.isEmpty, !trimmed.hasPrefix("#"),
                  let equals = trimmed.firstIndex(of: "=") else { continue }
            let existingKey = trimmed[..<equals].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            matchCount += 1
            matchIndex = index
        }

        let rendered = "\(key) = \"\(Self.tomlEscape(value))\""
        if let matchIndex {
            guard matchCount == 1 else {
                throw FileTargetError.updateFailed(
                    "TOML key '\(key)' matched \(matchCount) lines — refusing ambiguous update.")
            }
            // Preserve a trailing comment if present.
            let line = lines[matchIndex]
            var suffix = ""
            if let comment = line.range(of: "#") {
                suffix = " " + line[comment.lowerBound...]
            }
            lines[matchIndex] = rendered + suffix
        } else if table != nil, targetTableStart != nil {
            let insertion = targetTableEnd ?? lines.count
            lines.insert(rendered, at: insertion)
        } else if table == nil {
            // Insert before the first `[table]` header (targetTableEnd) so
            // the new top-level key does not land inside the last table;
            // when there are no tables at all, append at the end.
            if let end = targetTableEnd {
                lines.insert(rendered, at: end)
            } else {
                lines.append(rendered)
            }
        } else {
            if lines.last?.isEmpty == false { lines.append("") }
            lines.append("[\(table!)]")
            lines.append(rendered)
        }
        return lines.joined(separator: "\n")
    }

    static func tomlGet(key: String, table: String?, in text: String) -> String? {
        var currentTable: String?
        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("[") && trimmed.hasSuffix("]") && !trimmed.hasPrefix("[[") {
                currentTable = String(trimmed.dropFirst().dropLast())
                    .trimmingCharacters(in: .whitespaces)
                continue
            }
            guard currentTable == table,
                  !trimmed.hasPrefix("#"),
                  let equals = trimmed.firstIndex(of: "=") else { continue }
            let existingKey = trimmed[..<equals].trimmingCharacters(in: .whitespaces)
            guard existingKey == key else { continue }
            let raw = trimmed[trimmed.index(after: equals)...].trimmingCharacters(in: .whitespaces)
            if raw.hasPrefix("\"") {
                // Basic string: take up to the closing quote (handles
                // escaped quotes minimally), ignoring trailing comments.
                var result = ""
                var index = raw.index(after: raw.startIndex)
                while index < raw.endIndex {
                    let char = raw[index]
                    if char == "\\", raw.index(after: index) < raw.endIndex {
                        let next = raw[raw.index(after: index)]
                        if next == "\"" || next == "\\" {
                            result.append(next)
                        } else {
                            result.append(char)
                            result.append(next)
                        }
                        index = raw.index(index, offsetBy: 2)
                        continue
                    }
                    if char == "\"" { return result }
                    result.append(char)
                    index = raw.index(after: index)
                }
                return result
            }
            if raw.hasPrefix("'"),
               let closing = raw.dropFirst().firstIndex(of: "'") {
                return String(raw[raw.index(after: raw.startIndex)..<closing])
            }
            // Bare value: strip a trailing comment.
            var value = raw
            if let comment = value.range(of: "#") {
                value = value[..<comment.lowerBound].trimmingCharacters(in: .whitespaces)
            }
            return value
        }
        return nil
    }

    private static func tomlEscape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
